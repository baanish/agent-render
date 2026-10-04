import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import base from "../public/arx-dictionary.json";
import overlay from "../public/arx2-dictionary.json";
import priors from "../public/arx4-priors.json";
import { loadArxDictionarySync, loadArx2OverlayDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, type Arx4PriorId } from "@/lib/payload/arx4-codec";
import { arx6CompressEnvelope } from "@/lib/payload/arx6-codec";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const envelope: PayloadEnvelope = {
  v: 1, codec: "arx6", activeArtifactId: "a",
  artifacts: [{ id: "a", kind: "markdown", content: "# Versioned prior routing\n" }],
};

describe("ARX6 versioned prior loading", () => {
  beforeAll(() => {
    loadArxDictionarySync(base);
    loadArx2OverlayDictionarySync(overlay);
    expect(loadArx4PriorsSync(priors)).toBe(1);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("decodes an unprimed v2 link offline without fetching any codec assets", async () => {
    const wire = arx6CompressEnvelope(envelope, "n");
    vi.resetModules();
    const fetch = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetch);
    const { decodeFragmentAsync } = await import("@/lib/payload/fragment");
    expect(await decodeFragmentAsync(`#g${wire}`)).toMatchObject({ ok: true, envelope });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("decodes the frozen legacy unprimed link offline without fetching any codec assets", async () => {
    // Original #gn golden: its raw-container decoder never used dictionary substitution or a prior.
    const wire = "gnXY97WQnsK8W.ksR_UbTK~9qH_dCG948DR_W0X9spZWfw_ZfOF39PS-~OCuzD8Hk79NzTboqTm-o6koo2vgBsK.0hgVKIznTAwbKj8_QV-3nZ29QhK3nD6mU";
    const expected: PayloadEnvelope = {
      v: 1, codec: "arx6", title: "Bundle", activeArtifactId: "patch",
      artifacts: [
        { id: "patch", kind: "diff", patch: "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n", view: "split" },
        { id: "pair", kind: "diff", oldContent: "a\n", newContent: "b\n", language: "ts" },
      ],
    };
    vi.resetModules();
    const fetch = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetch);
    const { decodeFragmentAsync } = await import("@/lib/payload/fragment");
    expect(await decodeFragmentAsync(`#${wire}`)).toMatchObject({ ok: true, envelope: expected });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { skewed: "base", source: "fetched" },
    { skewed: "overlay", source: "fetched" },
    { skewed: "base", source: "installed" },
    { skewed: "overlay", source: "installed" },
  ])("emits unprimed v2 with a newer $source $skewed dictionary", async ({ skewed, source }) => {
    const expectedWire = `g${arx6CompressEnvelope(envelope, "n")}`;
    const primedWire = arx6CompressEnvelope(envelope, "m");
    vi.resetModules();
    const dictionaries = await import("@/lib/payload/arx-codec");
    const loadedBase = { ...base, version: skewed === "base" ? 2 : 1 };
    const loadedOverlay = { ...overlay, version: skewed === "overlay" ? 2 : 1 };
    if (source === "installed") {
      dictionaries.loadArxDictionarySync(loadedBase);
      dictionaries.loadArx2OverlayDictionarySync(loadedOverlay);
    }
    const fetch = vi.fn(async (url: RequestInfo | URL) => ({
      ok: true,
      json: async () => String(url).includes("arx2-dictionary") ? loadedOverlay : loadedBase,
    } as Response));
    vi.stubGlobal("fetch", fetch);
    const { encodeEnvelopeAsync, decodeFragmentAsync } = await import("@/lib/payload/fragment");

    const fragment = await encodeEnvelopeAsync(envelope, { codec: "arx6" });
    expect(fragment).toBe(expectedWire);
    expect(fragment.startsWith("g2n")).toBe(true);
    expect(dictionaries.getActiveDictVersion()).toBe(loadedBase.version);
    expect(dictionaries.getActiveArx2OverlayVersion()).toBe(loadedOverlay.version);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("arx4-priors"))).toBe(false);
    if (source === "installed") expect(fetch).not.toHaveBeenCalled();

    fetch.mockClear();
    expect(await decodeFragmentAsync(`#${fragment}`)).toMatchObject({ ok: true, envelope });
    expect(fetch).not.toHaveBeenCalled();
    // Substitution codecs still require compatible assets; only asset-free ARX6 gets this fallback.
    await expect(encodeEnvelopeAsync(envelope, { codec: "arx2" })).rejects.toThrow(/newer than/);
    const { decodeArxFragmentPayload } = await import("@/lib/payload/fragment-arx");
    await expect(decodeArxFragmentPayload("arx6", primedWire)).rejects.toThrow(/newer than/);
  });

  it.each(["m", "c", "j", "s", "n"] as Arx4PriorId[])("loads only the asset needed by a percent-encoded v2 %s link", async (prior) => {
    // Produce using the installed assets, then simulate a viewer with a cold module/asset cache.
    const wire = arx6CompressEnvelope(envelope, prior);
    vi.resetModules();
    const dictionaries = await import("@/lib/payload/arx-codec");
    dictionaries.loadArxDictionarySync(base);
    dictionaries.loadArx2OverlayDictionarySync(overlay);
    const coldPriors = await import("@/lib/payload/arx4-codec");
    expect(coldPriors.getActiveArx4PriorsVersion()).toBe(0);
    const fetch = vi.fn(async () => ({ ok: true, json: async () => priors } as Response));
    vi.stubGlobal("fetch", fetch);
    const { decodeFragmentAsync } = await import("@/lib/payload/fragment");
    const escapedHeader = `%32%${prior.charCodeAt(0).toString(16)}${wire.slice(2)}`;
    const parsed = await decodeFragmentAsync(`#g${escapedHeader}`);
    expect(parsed).toMatchObject({ ok: true, envelope });
    expect(fetch.mock.calls.length > 0).toBe(["m", "c", "j"].includes(prior));
  });
});
