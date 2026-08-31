import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { arx4DeterminismVectors, arx4VectorEnvelope } from "./fixtures/arx4-vectors";
import {
  isBase1kEncoded,
  isBase64urlEncoded,
  isBaseBMPEncoded,
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
} from "@/lib/payload/arx-codec";
import {
  arx4CompressEnvelope,
  arx4DecompressEnvelope,
  arx4PriorIdForEnvelope,
  loadArx4PriorsSync,
  type Arx4PriorId,
} from "@/lib/payload/arx4-codec";
import { decodeFragment, decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { createGeneratedArtifactLinkAsync, type LinkCreatorDraft } from "@/lib/payload/link-creator";
import { compactTagForCodec, type ArtifactKind, type PayloadEnvelope } from "@/lib/payload/schema";

const ARX4_TAG = compactTagForCodec("arx4");

const drafts: Record<ArtifactKind, LinkCreatorDraft> = {
  markdown: {
    kind: "markdown",
    title: "Release notes",
    filename: "notes.md",
    content: "# Release notes\n\n- Ship the arx4 codec\n- Keep fragments copyable\n\n| Surface | State |\n| --- | --- |\n| viewer | ready |\n| creator | ready |\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
  code: {
    kind: "code",
    title: "Wire selection",
    filename: "wire.ts",
    content: "export function selectWire(candidates: Candidate[]): Candidate {\n  return candidates.reduce((best, candidate) => (candidate.length < best.length ? candidate : best));\n}\n",
    language: "ts",
    diffView: "unified",
    codec: "arx4",
  },
  json: {
    kind: "json",
    title: "Manifest",
    filename: "manifest.json",
    content: "{\n  \"codec\": \"arx4\",\n  \"wire\": [\"base76\", \"base1k\", \"baseBMP\", \"base64url\"],\n  \"priors\": 5\n}\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
  csv: {
    kind: "csv",
    title: "Bench rows",
    filename: "bench.csv",
    content: "codec,bytes,visible\narx2,5410,7416\narx3,5410,2931\narx4,5147,2789\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
  diff: {
    kind: "diff",
    title: "Priority change",
    filename: "priority.patch",
    content: "diff --git a/src/lib/payload/fragment.ts b/src/lib/payload/fragment.ts\n--- a/src/lib/payload/fragment.ts\n+++ b/src/lib/payload/fragment.ts\n@@ -1 +1 @@\n-const ASYNC = [\"arx3\"];\n+const ASYNC = [\"arx4\", \"arx3\"];\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
};

/** Prior ids the encoder never selects on its own, so they only reach a decoder through this path. */
function envelopeWithPrior(priorId: Arx4PriorId): { envelope: PayloadEnvelope; fragment: string } {
  const envelope: PayloadEnvelope = {
    v: 1,
    codec: "arx4",
    title: `Prior ${priorId}`,
    activeArtifactId: "doc",
    artifacts: [{
      id: "doc",
      kind: "markdown",
      filename: "doc.md",
      content: `# Prior ${priorId}\n\nSame artifact, coded against the ${priorId} prior.\n`,
    }],
  };

  return { envelope, fragment: `${ARX4_TAG}${arx4CompressEnvelope(envelope, priorId).baseBMP}` };
}

const reportEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Baanish Code Bench",
  activeArtifactId: "baanish-code-bench",
  artifacts: [{
    id: "baanish-code-bench",
    kind: "markdown",
    title: "Baanish Code Bench",
    filename: "results.md",
    content: readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8"),
  }],
};

describe("arx4 codec", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    // Without the curated priors the encoder degrades every kind id to `s` (see
    // tests/arx4-priors.test.ts), so the kind-prior expectations below need the asset loaded.
    loadArx4PriorsSync(arx4PriorsJson);
  });

  describe("round trip", () => {
    it.each([
      ["markdown", "m"],
      ["code", "c"],
      ["json", "j"],
      ["csv", "j"],
      ["diff", "c"],
    ] as [ArtifactKind, Arx4PriorId][])("round-trips a %s draft on the %s prior", async (kind, priorId) => {
      const generatedLink = await createGeneratedArtifactLinkAsync(drafts[kind], "https://agent-render.com/");

      expect(generatedLink.codec).toBe("arx4");
      expect(generatedLink.hash.startsWith(`#${ARX4_TAG}${priorId}`)).toBe(true);

      const parsed = await decodeFragmentAsync(generatedLink.hash);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      expect(parsed.envelope).toEqual({ ...generatedLink.envelope, codec: "arx4" });
    });

    it.each(["s", "n"] as Arx4PriorId[])("round-trips the %s prior a kind never selects", async (priorId) => {
      const { envelope, fragment } = envelopeWithPrior(priorId);
      expect(fragment.charAt(1)).toBe(priorId);

      const parsed = await decodeFragmentAsync(`#${fragment}`);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      expect(parsed.envelope).toEqual(envelope);
    });

    it("stays async-only, like the rest of the arx family", () => {
      expect(decodeFragment(`#${ARX4_TAG}mZZ`)).toEqual({
        ok: false,
        code: "invalid-format",
        message: "arx codecs require async decoding — use decodeFragmentAsync instead.",
      });
    });
  });

  describe("wire payloads", () => {
    const envelope = envelopeWithPrior("m").envelope;

    it("decodes every wire alphabet back to the same envelope", () => {
      const payloads = arx4CompressEnvelope(envelope);

      expect(isBaseBMPEncoded(payloads.baseBMP.slice(1))).toBe(true);
      expect(isBase1kEncoded(payloads.base1k.slice(1))).toBe(true);
      expect(isBase64urlEncoded(payloads.base64url.slice(1))).toBe(true);
      expect(payloads.base76.slice(1)).toMatch(/^[A-Za-z0-9\-._~!$*()',;:@/=]+$/);

      for (const payload of Object.values(payloads)) {
        expect(arx4DecompressEnvelope(payload)).toEqual(envelope);
      }
    });

    // The kind ids each name their own curated corpus, so the id char is load-bearing: no two ids
    // produce the same coded bytes, and none of them matches the shared prior.
    it("codes every kind id against its own prior corpus", () => {
      const shared = arx4CompressEnvelope(envelope, "s").base64url;
      const coded = new Set([shared.slice(1)]);

      for (const priorId of ["m", "c", "j"] as Arx4PriorId[]) {
        const payload = arx4CompressEnvelope(envelope, priorId).base64url;
        expect(payload.charAt(0)).toBe(priorId);
        coded.add(payload.slice(1));
      }

      expect(coded.size).toBe(4);
    });

    it("rejects an unknown prior id instead of guessing a prior", async () => {
      const payload = arx4CompressEnvelope(envelope).baseBMP;
      const unknown = `z${payload.slice(1)}`;

      expect(() => arx4DecompressEnvelope(unknown)).toThrow(/Unsupported arx4 prior id "z"/);

      const parsed = await decodeFragmentAsync(`#${ARX4_TAG}${unknown}`);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.code).toBe("invalid-json");
    });
  });

  describe("selection", () => {
    it("still wins an explicit arx4 encode against arx3 on the report fixture", async () => {
      const arx4Fragment = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx4" });
      const arx3Fragment = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx3" });

      expect(arx4Fragment.startsWith(ARX4_TAG)).toBe(true);
      expect(arx4Fragment.length).toBeLessThan(arx3Fragment.length);

      const parsed = await decodeFragmentAsync(`#${arx4Fragment}`);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope).toEqual({ ...reportEnvelope, codec: "arx4" });
    });

    it("keeps an ASCII wire when the markdown surface budgets by transport length", async () => {
      const fragment = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx4", budgetByTransport: true });

      expect(fragment.startsWith(ARX4_TAG)).toBe(true);
      expect(fragment).toMatch(/^[\x21-\x7e]+$/);
      expect(isBaseBMPEncoded(fragment.slice(2))).toBe(false);
    });
  });

  /**
   * Characterization vectors. The coder is integer-only and primed from the pinned dictionaries, so
   * these strings are fixed for a given build; a diff here means the model, the prior, the tuple
   * stage or the dictionary changed, and every arx4 link already shared has stopped decoding.
   * base64url is the asserted wire because it is ASCII and diffs readably.
   */
  describe("determinism vectors", () => {
    it.each(arx4DeterminismVectors)("pins the %s prior payload", (priorId, content, expected) => {
      const envelope = arx4VectorEnvelope(content);

      expect(arx4PriorIdForEnvelope(envelope)).toBe("m");
      expect(arx4CompressEnvelope(envelope, priorId).base64url).toBe(expected);
      expect(arx4DecompressEnvelope(arx4CompressEnvelope(envelope, priorId).base64url)).toEqual(envelope);
    });
  });
});
