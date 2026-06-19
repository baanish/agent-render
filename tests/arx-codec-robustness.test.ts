import { beforeAll, describe, expect, it } from "vitest";
import arxDictionaryJson from "../public/arx-dictionary.json";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import {
  ArxDecodedPayloadTooLargeError,
  arx2CompressEnvelope,
  arx2DecompressEnvelope,
  arx3CompressEnvelope,
  arx3DecompressEnvelope,
  decodeBaseBMP,
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
} from "@/lib/payload/arx-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

// Regressions for bugs surfaced by the codec fuzzer. Each pins a property the fuzzer violated so a
// refactor cannot silently reintroduce it.

function markdownEnvelope(content: string): PayloadEnvelope {
  return { v: 1, codec: "plain", activeArtifactId: "a", artifacts: [{ id: "a", kind: "markdown", content }] };
}

beforeAll(() => {
  loadArxDictionarySync(arxDictionaryJson);
  loadArx2OverlayDictionarySync(arx2DictionaryJson);
});

describe("arx2/arx3 preserve a literal U+007F (DEL) byte in content", () => {
  // 0x7F is the one arx2/arx3 overlay substitution code that JSON.stringify leaves unescaped, so a
  // raw DEL in content used to be expanded back into a dictionary pattern on decode -> invalid
  // JSON. compressTupleEnvelope now escapes it to . If this fails after a refactor, that is
  // intentional only if the escaping policy changed — update the comment in arx-codec.ts too.
  for (const content of ["\x7f", "log\x7fend", "\x7f\x7f", "a\x7fb\x7fc"]) {
    it(`arx2 round-trips ${JSON.stringify(content)}`, async () => {
      const payloads = await arx2CompressEnvelope({ ...markdownEnvelope(content), codec: "arx2" });
      const decoded = await arx2DecompressEnvelope(payloads.base64url);
      expect(decoded.artifacts[0]).toMatchObject({ content });
    });

    it(`arx3 round-trips ${JSON.stringify(content)}`, async () => {
      const payloads = await arx3CompressEnvelope({ ...markdownEnvelope(content), codec: "arx3" });
      const decoded = await arx3DecompressEnvelope(payloads.base64url);
      expect(decoded.artifacts[0]).toMatchObject({ content });
    });
  }

  it("round-trips a DEL byte through the public encode/decode fragment API", async () => {
    const content = "terminal\x7fdump";
    const frag = await encodeEnvelopeAsync(markdownEnvelope(content), { codec: "arx3" });
    const decoded = await decodeFragmentAsync(`#${frag}`, { skipFragmentBudget: true });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.envelope.artifacts[0]).toMatchObject({ content });
    }
  });
});

describe("base-N decoders reject an implausible wire length instead of hanging", () => {
  // A ~27-char fragment used to drive decodeBaseBMP to compute byteLen ~3.8e9 and allocate multi-GB,
  // pegging a core for ~55s before the decoded-size budget ran. The wire-length guard now rejects
  // it before any allocation. The timing assertions pin "fast rejection, not a hang".
  it("decodeBaseBMP rejects an oversized length prefix fast", () => {
    const start = performance.now();
    expect(() => decodeBaseBMP("￰￮￮")).toThrow(ArxDecodedPayloadTooLargeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("decodeFragmentAsync returns decoded-too-large (not a hang) for a tiny malicious arx fragment", async () => {
    const start = performance.now();
    const result = await decodeFragmentAsync(
      "#agent-render=v1.arx.0.￰￮￮¡¢",
      { skipFragmentBudget: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("decoded-too-large");
    }
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
