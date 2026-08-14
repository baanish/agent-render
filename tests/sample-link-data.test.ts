import { describe, expect, it } from "vitest";
import { sampleLinkCards } from "@/components/home/sample-link-data";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import { compactTagForCodec } from "@/lib/payload/schema";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";

describe("homepage sample link data", () => {
  it("matches the generated sample fragments", () => {
    const expectedCards = sampleLinks.map((link, index) => {
      const expected = {
        title: link.title,
        hash: link.hash,
        fragmentLength: link.hash.length - 1,
        kind: link.kind,
        artifactCount: sampleEnvelopes[index].artifacts.length,
      };

      return link.description === undefined
        ? expected
        : { ...expected, description: link.description };
    });

    expect(
      sampleLinkCards.map((card, index) =>
        card.title === "arx showcase"
          ? {
              ...card,
              hash: expectedCards[index].hash,
              fragmentLength: expectedCards[index].fragmentLength,
            }
          : card,
      ),
    ).toEqual(expectedCards);
  });

  it("uses a real ARX5 fragment for the homepage ARX showcase sample", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson);

    const sample = sampleLinkCards.find((card) => card.title === "arx showcase");

    expect(sample?.hash?.startsWith(`#${compactTagForCodec("arx5")}`)).toBe(true);
    expect(sample?.hash?.slice(1)).toMatch(/^[\x21-\x7e]+$/);
    expect(sample?.fragmentLength).toBeLessThan(4000);

    const parsed = await decodeFragmentAsync(sample?.hash ?? "");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.codec).toBe("arx5");
    expect(parsed.envelope.title).toBe("arx showcase");
    expect(parsed.rawLength).toBe(sample?.fragmentLength);
  });
});
