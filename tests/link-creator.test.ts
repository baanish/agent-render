import { describe, expect, it } from "vitest";
import { decodeFragment, decodeFragmentAsync } from "@/lib/payload/fragment";
import { createDraftEnvelope, createGeneratedArtifactLink, createGeneratedArtifactLinkAsync, type LinkCreatorDraft } from "@/lib/payload/link-creator";

describe("link creator payloads", () => {
  it("builds a single-artifact envelope for pasted markdown", () => {
    const draft: LinkCreatorDraft = {
      kind: "markdown",
      title: "Team notes",
      filename: "notes.md",
      content: "# Hello\n\nThis came from the homepage creator.",
      language: "",
      diffView: "unified",
    };

    const envelope = createDraftEnvelope(draft);

    expect(envelope.title).toBe("Team notes");
    expect(envelope.activeArtifactId).toBe("team-notes");
    expect(envelope.artifacts).toEqual([
      {
        id: "team-notes",
        kind: "markdown",
        title: "Team notes",
        filename: "notes.md",
        content: "# Hello\n\nThis came from the homepage creator.",
      },
    ]);
  });

  it("round-trips a generated code link through the fragment decoder", () => {
    const draft: LinkCreatorDraft = {
      kind: "code",
      title: "Viewer shell",
      filename: "viewer-shell.tsx",
      content: "export function ViewerShell() {\n  return <main />;\n}",
      language: "tsx",
      diffView: "unified",
    };

    const generatedLink = createGeneratedArtifactLink(draft, "https://agent-render.com/");
    const parsed = decodeFragment(generatedLink.hash);

    expect(generatedLink.url).toContain("#agent-render=");
    expect(generatedLink.hash).toContain(`v1.${generatedLink.codec}.`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.codec).toBe(generatedLink.codec);
    expect(parsed.envelope.title).toBe("Viewer shell");
    expect(parsed.envelope.activeArtifactId).toBe("viewer-shell");
    expect(parsed.envelope.artifacts[0]).toMatchObject({
      id: "viewer-shell",
      kind: "code",
      filename: "viewer-shell.tsx",
      language: "tsx",
      content: "export function ViewerShell() {\n  return <main />;\n}",
    });
  });

  it("keeps diff view settings in generated links", () => {
    const draft: LinkCreatorDraft = {
      kind: "diff",
      title: "Release patch",
      filename: "release.patch",
      content:
        "diff --git a/src/app.ts b/src/app.ts\nindex 1111111..2222222 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const version = '0.1.0';\n+export const version = '0.2.0';\n",
      language: "",
      diffView: "split",
    };

    const generatedLink = createGeneratedArtifactLink(draft);
    const parsed = decodeFragment(generatedLink.hash);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.artifacts[0]).toMatchObject({
      kind: "diff",
      filename: "release.patch",
      view: "split",
    });
  });

  it("reports the actual wire codec for async generated links", async () => {
    const draft: LinkCreatorDraft = {
      kind: "code",
      title: "Codec sample",
      filename: "codec-sample.ts",
      content: "export const artifact = { kind: 'code', content: 'hello' };\n",
      language: "ts",
      diffView: "unified",
      codec: "arx2",
    };

    const generatedLink = await createGeneratedArtifactLinkAsync(draft, "https://agent-render.com/");
    const parsed = await decodeFragmentAsync(generatedLink.hash);

    expect(generatedLink.hash).toContain("#agent-render=v1.arx2.");
    expect(generatedLink.url).toContain("#agent-render=v1.arx2.");
    expect(generatedLink.codec).toBe("arx2");
    expect(generatedLink.envelope.codec).toBe("plain");
    expect(parsed.ok).toBe(true);
  });

  it("rejects empty pasted content", () => {
    expect(() =>
      createGeneratedArtifactLink({
        kind: "json",
        title: "Manifest",
        filename: "manifest.json",
        content: "   ",
        language: "",
        diffView: "unified",
      }),
    ).toThrow(/paste some content/i);
  });
});
