import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeBase76, encodeBase1k, encodeBaseBMP } from "@/lib/payload/arx-codec";
import fixtures from "./fixtures/arx-radix-wire-goldens.json";

type WireCase = {
  name: string;
  length?: number;
  pattern?: string;
  seed?: number;
  leadingZeros?: number;
  hex?: string;
  expected: Record<string, { length: number; sha256: string }>;
};

function bytesFor(testCase: WireCase): Uint8Array {
  if (testCase.hex !== undefined) return Uint8Array.from(Buffer.from(testCase.hex, "hex"));
  let state = testCase.seed ?? 0;
  return Uint8Array.from({ length: testCase.length! }, (_, index) => {
    if (testCase.pattern === "random") {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
    }
    if (index < (testCase.leadingZeros ?? 0)) return 0;
    return testCase.pattern === "ff" ? 255
      : testCase.pattern === "ramp" ? index & 255
        : testCase.pattern === "random" ? state & 255 : 0;
  });
}

describe("legacy radix wire identity", () => {
  // These expected wires were captured from the old implementation before replacing its quadratic
  // loops. They include leading/all-zero values, prefix boundaries, and exact powers of each radix
  // at both the 16-digit leaf and 32-digit recursive split boundaries.
  it.each(fixtures.cases)("preserves the frozen encodings for $name", (testCase: WireCase) => {
    const bytes = bytesFor(testCase);
    const backing = new Uint8Array(bytes.length + 7).fill(0xcd);
    backing.set(bytes, 3);
    const offsetView = backing.subarray(3, 3 + bytes.length);
    for (const [wire, encode] of Object.entries({ Base76: encodeBase76, Base1k: encodeBase1k, BaseBMP: encodeBaseBMP })) {
      for (const input of [bytes, offsetView]) {
        const encoded = encode(input);
        expect(encoded.length, wire).toBe(testCase.expected[wire].length);
        expect(createHash("sha256").update(encoded, "utf8").digest("hex"), wire).toBe(testCase.expected[wire].sha256);
      }
    }
  });
});
