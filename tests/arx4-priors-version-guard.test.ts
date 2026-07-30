import { beforeEach, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, type Arx4Priors } from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { compactTagForCodec, type PayloadEnvelope } from "@/lib/payload/schema";

// The compact `e` tag carries no priors version, so a CDN serving a newer asset than this build was
// coded against is a skew the codec has to notice. The two sides handle it differently on purpose:
// decode refuses, because coding against the wrong corpus yields plausible garbage, while encode
// degrades to the `s` prior, because the arx4 candidates share one pool with arx3/arx2/arx/deflate
// and throwing would take link creation down with them.
const envelope: PayloadEnvelope = {
  v: 1,
  codec: "arx4",
  activeArtifactId: "doc",
  artifacts: [{ id: "doc", kind: "markdown", content: "# Title\n\nSome content for the arx4 context mixer." }],
};

const priors: Arx4Priors = arx4PriorsJson;
const forwardPriors: Arx4Priors = { ...priors, version: priors.version + 1 };
const arx4Tag = compactTagForCodec("arx4");

describe("arx4 priors version guard", () => {
  beforeEach(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(priors); // expected version (1)
  });

  it("degrades encoding to the s prior instead of failing the whole candidate pool", async () => {
    expect(await encodeEnvelopeAsync(envelope, { codec: "arx4" })).toMatch(new RegExp(`^${arx4Tag}m`));

    loadArx4PriorsSync(forwardPriors);

    // arx4 still encodes, against the prior this build does support, and says so in the emitted id.
    const degraded = await encodeEnvelopeAsync(envelope, { codec: "arx4" });
    expect(degraded).toMatch(new RegExp(`^${arx4Tag}s`));
    const parsedDegraded = await decodeFragmentAsync(`#${degraded}`, { skipFragmentBudget: true });
    expect(parsedDegraded.ok).toBe(true);

    // And the shared auto pool is never rejected along with it.
    const auto = await encodeEnvelopeAsync(envelope);
    const parsedAuto = await decodeFragmentAsync(`#${auto}`, { skipFragmentBudget: true });
    expect(parsedAuto.ok).toBe(true);
  });

  it("refuses to decode a curated fragment while a forward-version asset is active", async () => {
    const curated = await encodeEnvelopeAsync(envelope, { codec: "arx4" });
    expect((await decodeFragmentAsync(`#${curated}`, { skipFragmentBudget: true })).ok).toBe(true);

    loadArx4PriorsSync(forwardPriors);
    const skewed = await decodeFragmentAsync(`#${curated}`, { skipFragmentBudget: true });
    expect(skewed.ok).toBe(false); // hard-fail, not a silent mis-decode

    // Retryable: the same link decodes again once the expected-version asset is active.
    loadArx4PriorsSync(priors);
    const recovered = await decodeFragmentAsync(`#${curated}`, { skipFragmentBudget: true });
    expect(recovered.ok).toBe(true);
  });
});
