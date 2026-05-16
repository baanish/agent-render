import { describe, expect, it } from "vitest";
import { sampleLinkCards } from "@/components/home/sample-link-data";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
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

  it("uses a real ARX3 fragment for the homepage ARX showcase sample", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);

    const sample = sampleLinkCards.find((card) => card.title === "arx showcase");

    expect(sample?.hash).toContain("#agent-render=v1.arx3.1.");
    expect(sample?.fragmentLength).toBeLessThan(1900);

    const parsed = await decodeFragmentAsync(sample?.hash ?? "");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.codec).toBe("arx3");
    expect(parsed.envelope.title).toBe("arx showcase");
    expect(parsed.rawLength).toBe(sample?.fragmentLength);
  });
});
