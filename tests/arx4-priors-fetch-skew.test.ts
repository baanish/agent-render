import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import {
  EXPECTED_ARX4_PRIORS_VERSION,
  getActiveArx4PriorsVersion,
  isArx4PriorsLoaded,
  loadArx4Priors,
  type Arx4Priors,
} from "@/lib/payload/arx4-codec";

/**
 * A default priors load tries `/arx4-priors.json.br` first and falls back to the plain JSON, so a
 * mid-deploy CDN can serve one version from one URL and another from the other. Installing whatever
 * the first URL answers with wedges the page: curated coding needs the expected version exactly, and
 * a sticky off-version install makes every retry hit the same skewed URL again.
 */
const priors: Arx4Priors = arx4PriorsJson;
const forwardPriors: Arx4Priors = { ...priors, version: priors.version + 1 };

function stubPriorsFetch(bodyForUrl: (url: string) => unknown) {
  const fetchSpy = vi.fn((input: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(bodyForUrl(String(input))) } as Response),
  );
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("arx4 priors fetch skew", () => {
  beforeAll(() => {
    // The install check reassembles each kind block against the pinned dictionary text, so the
    // dictionaries have to be the shipped ones before any priors load can succeed.
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Runs first: it is the only case that can observe the never-installed slot.
  it("leaves the slot uninstalled and refetchable when every URL is off-version", async () => {
    const fetchSpy = stubPriorsFetch(() => forwardPriors);

    expect(await loadArx4Priors()).toBe(-1);
    expect(isArx4PriorsLoaded()).toBe(false);
    expect(getActiveArx4PriorsVersion()).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps fetching past an off-version .br asset instead of installing it", async () => {
    const fetchSpy = stubPriorsFetch((url) => (url.endsWith(".br") ? forwardPriors : priors));

    expect(await loadArx4Priors()).toBe(EXPECTED_ARX4_PRIORS_VERSION);
    expect(getActiveArx4PriorsVersion()).toBe(EXPECTED_ARX4_PRIORS_VERSION);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps fetching past a digest-corrupt right-version .br asset", async () => {
    const corruptPriors: Arx4Priors = { ...priors, kinds: { ...priors.kinds, markdown: "x" } };
    const fetchSpy = stubPriorsFetch((url) => (url.endsWith(".br") ? corruptPriors : priors));

    expect(await loadArx4Priors()).toBe(EXPECTED_ARX4_PRIORS_VERSION);
    expect(getActiveArx4PriorsVersion()).toBe(EXPECTED_ARX4_PRIORS_VERSION);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
