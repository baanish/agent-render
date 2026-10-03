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
