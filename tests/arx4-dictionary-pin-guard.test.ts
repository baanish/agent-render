import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { arx4DeterminismVectors, arx4VectorEnvelope } from "./fixtures/arx4-vectors";
import {
  getActiveArx2OverlayVersion,
  getActiveDictVersion,
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
} from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { Arx4DictionarySkewError, decodeArxFragmentPayload } from "@/lib/payload/fragment-arx";
import { compactTagForCodec, type PayloadEnvelope } from "@/lib/payload/schema";

// arx4/arx5 code with the dictionary text twice over (substitution stage plus the context-mixer prior)
// and the compact `e`/`f` tags carry no dictionary version, so a fragment coded against anything but
// the pinned dictionaries is a link no healthy viewer can decode. Unlike arx/arx2/arx3, which tolerate
// the built-in fallback dictionary, the mixer codecs hold out for the exact pinned pair on both sides:
// encode drops out of the candidate pool, decode refuses.
const ARX4_TAG = compactTagForCodec("arx4");
const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  activeArtifactId: "doc",
  artifacts: [{ id: "doc", kind: "markdown", content: "# Missing assets fallback" }],
};
const [, curatedContent, curatedPayload] = arx4DeterminismVectors[0];
const curatedFragment = `#${ARX4_TAG}${curatedPayload}`;

describe("arx4 dictionary pin guard", () => {
  // The dictionary fetch failing is what leaves the built-in version-0 dictionary active, and the
  // module registry starts on the built-in pair, so a rejecting fetch reproduces that state exactly.
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("dictionary endpoint is down"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // These first two cases need the built-in fallback dictionary active, which no test can restore once
  // another has loaded the shipped one, so they run before the recovery cases below.
  it("skips arx4 in the shared candidate pool while the built-in fallback dictionary is active", async () => {
    const fragment = await encodeEnvelopeAsync(envelope);

    expect(getActiveDictVersion()).toBe(0);
    expect(fragment.startsWith(ARX4_TAG)).toBe(false);
    expect(fragment.startsWith(compactTagForCodec("arx5"))).toBe(false);

    // The rest of the pool still serves the link, and what it emits decodes.
    expect((await decodeFragmentAsync(`#${fragment}`, { skipFragmentBudget: true })).ok).toBe(true);

    // An explicit arx4 request has no pool left to select from, which is the fail-closed outcome:
    // no link is minted that healthy viewers would reject.
    await expect(encodeEnvelopeAsync(envelope, { codec: "arx4" })).rejects.toThrow();
  });

  it("refuses a curated fragment as an unavailable asset instead of decoding on the fallback", async () => {
    expect(getActiveDictVersion()).toBe(0);

    await expect(decodeArxFragmentPayload("arx4", curatedPayload)).rejects.toThrow(Arx4DictionarySkewError);

    const parsed = await decodeFragmentAsync(curatedFragment, { skipFragmentBudget: true });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("asset-unavailable");
    expect(parsed.message).toMatch(/reload/i);
  });

  it("codes arx4 again once the pinned dictionaries are active", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson);

    const fragment = await encodeEnvelopeAsync(envelope, { codec: "arx4" });
    expect(fragment.startsWith(ARX4_TAG)).toBe(true);

    const parsed = await decodeFragmentAsync(curatedFragment, { skipFragmentBudget: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope).toEqual(arx4VectorEnvelope(curatedContent));
  });

  // An OLDER overlay passes the family's "not newer than expected" guard, so arx4 has to reject it on
  // its own exact pin rather than inherit that tolerance.
  it("skips and refuses arx4 when only the overlay dictionary is off the pinned version", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync({ ...arx2DictionaryJson, version: 0 });
    expect(getActiveDictVersion()).toBe(1);
    expect(getActiveArx2OverlayVersion()).toBe(0);

    expect((await encodeEnvelopeAsync(envelope)).startsWith(ARX4_TAG)).toBe(false);

    const parsed = await decodeFragmentAsync(curatedFragment, { skipFragmentBudget: true });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("asset-unavailable");
  });
});
