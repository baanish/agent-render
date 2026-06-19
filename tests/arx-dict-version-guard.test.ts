import { beforeEach, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

// Compact arx links carry no dictionary version (the tag implies the current dictionary), so a build
// must refuse to decode with a skewed-version dictionary rather than silently mis-decode. These
// tests exercise that guard by making a different-version dictionary active and confirming decode
// hard-fails, then recovers when the expected version is restored.
const envelope: PayloadEnvelope = {
  v: 1,
  codec: "arx2",
  activeArtifactId: "doc",
  artifacts: [{ id: "doc", kind: "markdown", content: "# Title\n\nSome content for the arx dense path." }],
};

describe("arx dictionary version guard", () => {
  beforeEach(() => {
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArxDictionarySync(arxDictionaryJson); // expected version (1)
  });

  it("refuses to decode a compact arx link when the base dictionary version is skewed", async () => {
    const fragment = await encodeEnvelopeAsync(envelope, { codec: "arx2", preferPacked: true });

    const okParsed = await decodeFragmentAsync(`#${fragment}`, { skipFragmentBudget: true });
    expect(okParsed.ok).toBe(true);

    // Simulate asset/CDN skew or a future bump: a different-version dictionary becomes active.
    loadArxDictionarySync({ ...arxDictionaryJson, version: 2 });
    const skewed = await decodeFragmentAsync(`#${fragment}`, { skipFragmentBudget: true });
    expect(skewed.ok).toBe(false); // hard-fail, not a silent mis-decode

    // Recovers once the expected-version dictionary is active again.
    loadArxDictionarySync(arxDictionaryJson);
    const recovered = await decodeFragmentAsync(`#${fragment}`, { skipFragmentBudget: true });
    expect(recovered.ok).toBe(true);
  });

  it("refuses to decode when the arx2 overlay dictionary version is skewed", async () => {
    const fragment = await encodeEnvelopeAsync(envelope, { codec: "arx2", preferPacked: true });

    loadArx2OverlayDictionarySync({ ...arx2DictionaryJson, version: 2 });
    const skewed = await decodeFragmentAsync(`#${fragment}`, { skipFragmentBudget: true });
    expect(skewed.ok).toBe(false);
  });
});
