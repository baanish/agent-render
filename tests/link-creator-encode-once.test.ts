import { beforeEach, describe, expect, it, vi } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, type Arx4Priors } from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import { createGeneratedArtifactLinkAsync, type LinkCreatorDraft } from "@/lib/payload/link-creator";

/**
 * A generated link needs two selections over the same candidates: the copy-paste URL uses each
 * codec's default budget while the markdown destination is measured percent-escaped. Those are two
 * reads of one pool, not two encodes: the context mixer costs ~770 ms per 60 KB artifact, so a
 * second pass would double every link creation's main-thread stall for identical bytes.
 */
const mixerCompressions = vi.fn();

vi.mock("@/lib/payload/arx4-codec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payload/arx4-codec")>();
  return {
    ...actual,
    arx4CompressEnvelope: (...args: Parameters<typeof actual.arx4CompressEnvelope>) => {
      mixerCompressions(...args);
      return actual.arx4CompressEnvelope(...args);
    },
    arx5CompressEnvelope: (...args: Parameters<typeof actual.arx5CompressEnvelope>) => {
      mixerCompressions(...args);
      return actual.arx5CompressEnvelope(...args);
    },
  };
});

const draft: LinkCreatorDraft = {
  kind: "markdown",
  title: "Launch note",
  filename: "brief.md",
  content: [
    "# Launch note",
    "",
    "Share one artifact at a time without uploading it anywhere.",
    "",
    "- Markdown stays readable",
    "- Code keeps its language hint",
    "- The link works from a static export",
  ].join("\n"),
  language: "",
  diffView: "unified",
  codec: "arx4",
};

describe("async link creation", () => {
  beforeEach(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson as Arx4Priors);
    mixerCompressions.mockClear();
  });

  it("codes the payload once and picks both link surfaces from that pool", async () => {
    const generatedLink = await createGeneratedArtifactLinkAsync(draft, "https://agent-render.com/");

    expect(mixerCompressions).toHaveBeenCalledTimes(1);

    // Both surfaces still come out of the pool decodable, and to the same envelope.
    const markdownFragment = generatedLink.markdownUrl.slice(generatedLink.markdownUrl.indexOf("#") + 1);
    const parsedMarkdown = await decodeFragmentAsync(`#${markdownFragment}`);
    const parsedPaste = await decodeFragmentAsync(generatedLink.hash);
    expect(parsedMarkdown.ok).toBe(true);
    expect(parsedPaste.ok).toBe(true);
    if (parsedMarkdown.ok && parsedPaste.ok) {
      expect(parsedMarkdown.envelope).toEqual(parsedPaste.envelope);
    }
  });

  it("codes the payload once in auto mode too, where arx5 leads the codec priority", async () => {
    await createGeneratedArtifactLinkAsync({ ...draft, codec: "auto" }, "https://agent-render.com/");

    expect(mixerCompressions).toHaveBeenCalledTimes(1);
  });
});
