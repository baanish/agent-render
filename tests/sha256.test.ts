import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/sha256";

// The browser-side digest that gates the arx4 priors asset has to agree with node:crypto exactly, or
// the shipped asset would be rejected in one runtime and accepted in the other. Lengths cover the
// padding boundaries (the block that has no room for the length field, the exact-block case) and the
// 16 KiB scale the priors check runs at.
const LENGTHS = [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 127, 128, 16 * 1024];

describe("sha256Hex", () => {
  it.each(LENGTHS)("matches node:crypto for a %i-byte input", (length) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = (index * 31 + 7) % 256;
    }

    expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("matches the published digest of \"abc\"", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
