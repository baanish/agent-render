import { beforeAll, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { decodeFragment, decodeFragmentAsync, encodeEnvelope, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { compactCodecTags, type PayloadEnvelope } from "@/lib/payload/schema";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Compact header",
  activeArtifactId: "doc",
  artifacts: [{ id: "doc", kind: "markdown", filename: "doc.md", content: "# Compact\n\nShort and sweet." }],
};

function markdownContent(parsed: Extract<ReturnType<typeof decodeFragment>, { ok: true }>): string {
  const artifact = parsed.envelope.artifacts[0];
  return artifact.kind === "markdown" ? artifact.content : "";
}

describe("compact fragment header", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
  });

  // Characterization: the tag table is the wire contract. If this changes, update the doc-comment in
  // schema.ts AND keep the legacy decode path together — a tag remap silently mis-decodes old links.
  it("pins the codec -> tag table", () => {
    expect(compactCodecTags).toEqual({
      plain: "p",
      lz: "l",
      deflate: "d",
      arx: "a",
      arx2: "b",
      arx3: "c",
    });
  });

  it("emits a single-char header and drops the legacy key, version, and codec name", () => {
    const fragment = encodeEnvelope(envelope, { codec: "deflate" });
    expect(fragment.startsWith("d")).toBe(true);
    expect(fragment).not.toContain("agent-render=");
    expect(fragment).not.toContain("v1.");
  });

  it("round-trips every codec through the compact header", async () => {
    for (const codec of ["plain", "lz", "deflate"] as const) {
      const parsed = decodeFragment(`#${encodeEnvelope(envelope, { codec })}`);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(markdownContent(parsed)).toBe(envelope.artifacts[0].kind === "markdown" ? envelope.artifacts[0].content : "");
    }
    for (const codec of ["arx", "arx2", "arx3"] as const) {
      const parsed = await decodeFragmentAsync(`#${await encodeEnvelopeAsync(envelope, { codec })}`);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(markdownContent(parsed)).toBe(envelope.artifacts[0].kind === "markdown" ? envelope.artifacts[0].content : "");
    }
  });

  it("still decodes legacy agent-render=v1... fragments (back-compat)", () => {
    // Reconstruct a real legacy deflate fragment (same payload, legacy prefix) and decode it.
    const legacy = `#agent-render=v1.deflate.${encodeEnvelope(envelope, { codec: "deflate" }).slice(1)}`;
    const parsed = decodeFragment(legacy);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope.title).toBe("Compact header");
  });

  it("saves the full legacy header overhead", () => {
    const compact = encodeEnvelope(envelope, { codec: "deflate" });
    const legacy = `agent-render=v1.deflate.${compact.slice(1)}`;
    expect(legacy.length - compact.length).toBe("agent-render=v1.deflate.".length - "d".length);
  });

  it("rejects an unknown compact tag", () => {
    const parsed = decodeFragment("#zSOMEPAYLOAD");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe("invalid-format");
  });
});
