import { describe, expect, it } from "vitest";
import { sampleLinkCards } from "@/components/home/sample-link-data";
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";

describe("homepage sample link data", () => {
  it("matches the generated sample fragments", () => {
    expect(sampleLinkCards).toEqual(
      sampleLinks.map((link, index) => {
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
      }),
    );
  });
});
