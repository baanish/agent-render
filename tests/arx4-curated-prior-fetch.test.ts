import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { arx4DeterminismVectors } from "./fixtures/arx4-vectors";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { getActiveArx4PriorsVersion } from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import { compactTagForCodec } from "@/lib/payload/schema";

/**
 * The lazy priors fetch is routed off the fragment's prior id char, and the decoder reads that char
 * after percent-decoding: a re-encoding proxy or a handcrafted fragment can deliver `%6d` where the
 * app itself would have written `m`. Routing on the raw char leaves such a fragment permanently
 * undecodable, because the asset it needs is never requested however often the viewer retries.
 */
const ARX4_TAG = compactTagForCodec("arx4");
const [, curatedContent, curatedPayload] = arx4DeterminismVectors[0];
const [, sharedContent, sharedPayload] = arx4DeterminismVectors[3];

function percentEncodeFirstChar(payload: string): string {
  return `%${payload.charCodeAt(0).toString(16)}${payload.slice(1)}`;
}

describe("arx4 curated prior fetch routing", () => {
  const fetchSpy = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(arx4PriorsJson) } as Response),
  );

  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    // Deliberately no priors: these cases are about which fragments trigger the lazy fetch.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
  });

  // Runs first, while the priors slot is still cold: a fetch here would be an unnecessary one.
  it("still skips the fetch for a percent-encoded shared prior id", async () => {
    expect(getActiveArx4PriorsVersion()).toBe(0);
    vi.stubGlobal("fetch", fetchSpy);

    const parsed = await decodeFragmentAsync(
      `#${ARX4_TAG}${percentEncodeFirstChar(sharedPayload)}`,
      { skipFragmentBudget: true },
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.artifacts[0]).toMatchObject({ content: sharedContent });
  });

  it("fetches the curated asset for a percent-encoded curated prior id", async () => {
    expect(getActiveArx4PriorsVersion()).toBe(0);
    vi.stubGlobal("fetch", fetchSpy);

    const parsed = await decodeFragmentAsync(
      `#${ARX4_TAG}${percentEncodeFirstChar(curatedPayload)}`,
      { skipFragmentBudget: true },
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.artifacts[0]).toMatchObject({ content: curatedContent });
  });
});
