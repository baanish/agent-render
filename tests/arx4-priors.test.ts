import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { arx4DeterminismVectors, arx4VectorEnvelope } from "./fixtures/arx4-vectors";
import {
  getArxDictionaryPriorText,
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
} from "@/lib/payload/arx-codec";
import {
  arx4CompressEnvelope,
  arx4DecompressEnvelope,
  Arx4PriorsUnavailableError,
  getActiveArx4PriorsVersion,
  isArx4PriorsLoaded,
  loadArx4Priors,
  loadArx4PriorsSync,
  type Arx4Priors,
} from "@/lib/payload/arx4-codec";

/**
 * Byte-identity gate for public/arx4-priors.json, plus the behavior on either side of loading it.
 *
 * The asset carries only the kind-specific tail of each curated prior; the codec rebuilds the
 * 2203-char common prefix from the pinned dictionaries. These hashes are the 16384-char priors
 * docs/arx4-cm-bench.md measured, as the frozen scripts/arx4-cm-determinism.mjs builds them. A diff
 * here means the asset, the dictionaries or the split changed, and every arx4 link on an `m`, `c` or
 * `j` prior has stopped decoding. Regenerate with `node scripts/build-arx4-priors.mjs`, which fails
 * the same way when it cannot reproduce these from the frozen source.
 */
const PINNED_PRIOR_SHA256 = {
  markdown: "90da74cfa7a7394099aefd7d8f3ba9ed2acc40237b23d58048f4b8b4dd596c9c",
  code: "3596c70d73b7d3f95e5f978a0c3bcb4ae1d4aa8711d563f4a22f39d0123aa6af",
  json: "37e1cfa8f8885afda7e560d63616b4e84e891a1c3a63d2ac3a139ebe6558fb18",
} as const;

const COMMON_PREFIX_CHARS = 2203;
const PRIOR_CHARS = 16 * 1024;

const priors: Arx4Priors = arx4PriorsJson;
const [, curatedVectorContent, curatedVectorPayload] = arx4DeterminismVectors[0];

describe("arx4 priors asset", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
  });

  // Runs first on purpose: the codec holds one module-level priors slot with no unload path, so the
  // unloaded behavior can only be observed before any test loads the asset. Each case re-asserts the
  // unloaded state so a reordering fails on the precondition instead of on the behavior.
  describe("before the asset loads", () => {
    it("reports itself unloaded", () => {
      expect(isArx4PriorsLoaded()).toBe(false);
      expect(getActiveArx4PriorsVersion()).toBe(0);
    });

    it("encodes on the shared prior and emits the s id rather than blocking", () => {
      expect(isArx4PriorsLoaded()).toBe(false);

      const envelope = arx4VectorEnvelope(curatedVectorContent);
      const payload = arx4CompressEnvelope(envelope).base64url;

      expect(payload.charAt(0)).toBe("s");
      expect(payload).toBe(arx4CompressEnvelope(envelope, "s").base64url);
    });

    it("refuses a curated fragment instead of decoding it against the shared prior", () => {
      expect(isArx4PriorsLoaded()).toBe(false);
      expect(() => arx4DecompressEnvelope(curatedVectorPayload)).toThrow(Arx4PriorsUnavailableError);
    });

    it("decodes s and n fragments without attempting the priors fetch", async () => {
      expect(isArx4PriorsLoaded()).toBe(false);
      const fetchSpy = vi.fn(() => {
        throw new Error("priors fetch must not happen for s/n fragments");
      });
      vi.stubGlobal("fetch", fetchSpy);
      try {
        const { decodeArxFragmentPayload } = await import("@/lib/payload/fragment-arx");
        for (const [priorId, content, payload] of arx4DeterminismVectors) {
          if (priorId !== "s" && priorId !== "n") continue;
          const decoded = await decodeArxFragmentPayload("arx4", payload);
          const envelope = typeof decoded === "string" ? JSON.parse(decoded) : decoded;
          expect(envelope.artifacts[0].content).toBe(content);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("loading", () => {
    it("reports a fetch failure as -1 so the caller can retry", async () => {
      expect(await loadArx4Priors("http://127.0.0.1:1/arx4-priors.json")).toBe(-1);
      expect(isArx4PriorsLoaded()).toBe(false);
    });

    it("rejects an asset that is missing a curated kind", async () => {
      expect(await loadArx4Priors({ version: 1, kinds: { markdown: "x" } } as unknown as Arx4Priors)).toBe(-1);
      expect(isArx4PriorsLoaded()).toBe(false);
    });

    it("loads the shipped asset at the version this build pins", () => {
      expect(loadArx4PriorsSync(priors)).toBe(1);
      expect(isArx4PriorsLoaded()).toBe(true);
      expect(getActiveArx4PriorsVersion()).toBe(1);
    });
  });

  describe("with the asset loaded", () => {
    beforeAll(() => {
      loadArx4PriorsSync(priors);
    });

    it("reassembles the benched 16384-char priors byte for byte", () => {
      const commonPrefix = `${getArxDictionaryPriorText()}\n`;
      expect(commonPrefix).toHaveLength(COMMON_PREFIX_CHARS);

      for (const [kind, expectedSha256] of Object.entries(PINNED_PRIOR_SHA256)) {
        const prior = `${commonPrefix}${priors.kinds[kind as keyof typeof PINNED_PRIOR_SHA256]}`;

        expect(prior).toHaveLength(PRIOR_CHARS);
        expect(Buffer.byteLength(prior, "utf8")).toBe(PRIOR_CHARS);
        expect(createHash("sha256").update(prior, "utf8").digest("hex")).toBe(expectedSha256);
      }
    });

    it("decodes the curated fragment the unloaded build refused", () => {
      expect(arx4DecompressEnvelope(curatedVectorPayload)).toEqual(arx4VectorEnvelope(curatedVectorContent));
    });
  });
});
