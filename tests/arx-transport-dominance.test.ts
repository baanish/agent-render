import { beforeAll, describe, expect, it } from "vitest";
import arxDictionary from "../public/arx-dictionary.json";
import arx2Dictionary from "../public/arx2-dictionary.json";
import arx4Priors from "../public/arx4-priors.json";
import {
  encodeArxTransportWirePayloads,
  encodeArxWirePayloads,
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
  type ArxTransportWirePayloads,
  type ArxWirePayloads,
} from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import { buildArxCandidates, buildArx2Candidates, buildArx5Candidates } from "@/lib/payload/fragment-arx";
import { getFragmentTransportLength } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const wireOrder: (keyof ArxWirePayloads)[] = ["base76", "base1k", "baseBMP", "base64url"];

function winner(payloads: ArxTransportWirePayloads) {
  return wireOrder.filter((wire) => payloads[wire] !== undefined)
    .map((wire) => ({ wire, value: payloads[wire]! }))
    .sort((a, b) => getFragmentTransportLength(a.value) - getFragmentTransportLength(b.value))[0];
}

describe("provable ARX transport dominance", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionary);
    loadArx2OverlayDictionarySync(arx2Dictionary);
    loadArx4PriorsSync(arx4Priors);
  });

  it("preserves the exact winning wire and all retained bytes across significant-bit boundaries", () => {
    let state = 0x6174d12f;
    function random() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return state >>> 0;
    }
    const sizes = [0, 1, 2, 3, 7, 14, 31, 64, 255, 1024, 8192];
    for (const size of sizes) {
      for (const leadingZeros of [0, 1, Math.floor(size / 2), Math.max(0, size - 1), size]) {
        const bytes = Uint8Array.from({ length: size }, (_, index) => index < leadingZeros ? 0 : random() & 255);
        const full = encodeArxWirePayloads(bytes);
        const pruned = encodeArxTransportWirePayloads(bytes);
        expect(Object.keys(full)).toHaveLength(4);
        expect(winner(pruned)).toEqual(winner(full));
        for (const wire of wireOrder) {
          if (pruned[wire] !== undefined) expect(pruned[wire]).toBe(full[wire]);
          else expect(getFragmentTransportLength(full[wire])).toBeGreaterThan(full.base64url.length);
        }
      }
    }
    for (let index = 0; index < 180; index++) {
      const size = random() % 1024;
      const leadingZeros = random() % (size + 1);
      const bytes = Uint8Array.from({ length: size }, (_, at) => at < leadingZeros ? 0 : random() & 255);
      expect(winner(encodeArxTransportWirePayloads(bytes))).toEqual(winner(encodeArxWirePayloads(bytes)));
    }
  });

  it("keeps empty, leading-zero, and equal-bound candidates", () => {
    expect(encodeArxTransportWirePayloads(new Uint8Array())).toEqual(encodeArxWirePayloads(new Uint8Array()));
    // The prefix-only base1k lower bound equals base64url's 12-character output here.
    expect(encodeArxTransportWirePayloads(new Uint8Array(7)).base1k).toBeDefined();
    // The analogous BMP lower bound is 21 characters; equality must not be pruned.
    expect(encodeArxTransportWirePayloads(new Uint8Array(14)).baseBMP).toBeDefined();
    const zeroes = encodeArxTransportWirePayloads(new Uint8Array(8192));
    expect(zeroes.base1k).toBeDefined();
    expect(zeroes.baseBMP).toBeDefined();
    const nonzero = encodeArxTransportWirePayloads(new Uint8Array(8192).fill(255));
    expect(nonzero.base1k).toBeUndefined();
    expect(nonzero.baseBMP).toBeUndefined();
  });

  it("leaves custom-scored builders complete and preserves each transport winner on opt-in", async () => {
    const envelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      artifacts: [{ id: "a", kind: "markdown", content: "# Runtime proof\n\nA general transport bound preserves all winners.\n".repeat(16) }],
    };
    const builders = [
      (transportOnly: boolean) => buildArxCandidates(envelope, true, getFragmentTransportLength, transportOnly),
      (transportOnly: boolean) => buildArxCandidates(envelope, false, getFragmentTransportLength, transportOnly),
      (transportOnly: boolean) => buildArx2Candidates(envelope, getFragmentTransportLength, transportOnly),
      (transportOnly: boolean) => buildArx5Candidates(envelope, getFragmentTransportLength, transportOnly),
    ];
    for (const build of builders) {
      const complete = await build(false);
      const pruned = await build(true);
      expect(complete).toHaveLength(4);
      expect(pruned).toHaveLength(2);
      expect(pruned.toSorted((a, b) => a.transportLength - b.transportLength)[0])
        .toEqual(complete.toSorted((a, b) => a.transportLength - b.transportLength)[0]);
    }
    expect(await buildArxCandidates(envelope, true, (value) => value.length)).toHaveLength(4);
    expect(await buildArx2Candidates(envelope, (value) => value.length)).toHaveLength(4);
    expect(await buildArx5Candidates(envelope, (value) => value.length)).toHaveLength(4);
  });
});
