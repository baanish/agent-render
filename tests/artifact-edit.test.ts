import { describe, expect, it } from "vitest";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import {
  applyArtifactEditDraft,
  createArtifactEditDraft,
  createGeneratedEnvelopeLinkAsync,
} from "@/lib/payload/link-creator";
import type { ArtifactPayload, DiffArtifact, PayloadEnvelope } from "@/lib/payload/schema";

const markdownArtifact: ArtifactPayload = {
  id: "notes",
  kind: "markdown",
  title: "Team notes",
  filename: "notes.md",
  content: "# Hello\n\nOriginal notes.",
};

const codeArtifact: ArtifactPayload = {
  id: "shell",
  kind: "code",
  title: "Viewer shell",
  filename: "viewer-shell.tsx",
  language: "tsx",
  content: "export function ViewerShell() {\n  return <main />;\n}",
};

const csvArtifact: ArtifactPayload = {
  id: "export",
  kind: "csv",
  title: "Export",
  filename: "export.csv",
  content: "name,status\nviewer,ready",
};

const jsonArtifact: ArtifactPayload = {
  id: "manifest",
  kind: "json",
  title: "Manifest",
  filename: "manifest.json",
  content: '{"ok":true}',
};

const patchDiffArtifact: DiffArtifact = {
  id: "release",
  kind: "diff",
  title: "Release patch",
  filename: "release.patch",
  patch:
    "diff --git a/src/app.ts b/src/app.ts\nindex 1111111..2222222 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const version = '0.1.0';\n+export const version = '0.2.0';\n",
  view: "unified",
  language: "ts",
};

const pairDiffArtifact: DiffArtifact = {
  id: "pair",
  kind: "diff",
  title: "Pair diff",
  filename: "pair.diff",
  oldContent: "alpha",
  newContent: "beta",
  view: "split",
};

function envelopeFor(artifacts: ArtifactPayload[], title = "Bundle"): PayloadEnvelope {
  return {
    v: 1,
    codec: "plain",
    title,
    activeArtifactId: artifacts[0]?.id,
    artifacts,
  };
}

describe("artifact edit drafts", () => {
  it("round-trips every artifact kind back onto the same id", () => {
    const artifacts = [
      markdownArtifact,
      codeArtifact,
      csvArtifact,
      jsonArtifact,
      patchDiffArtifact,
      pairDiffArtifact,
    ];

    for (const artifact of artifacts) {
      const draft = createArtifactEditDraft(artifact);
      const next = applyArtifactEditDraft(envelopeFor([artifact], artifact.title), draft);

      expect(next.artifacts).toHaveLength(1);
      expect(next.artifacts[0]).toMatchObject({
        id: artifact.id,
        kind: artifact.kind,
        title: artifact.title,
        filename: artifact.filename,
      });
      if (artifact.kind === "diff") {
        if ("patch" in artifact && artifact.patch) {
          expect(next.artifacts[0]).toMatchObject({ patch: artifact.patch, view: artifact.view });
        } else {
          expect(next.artifacts[0]).toMatchObject({
            oldContent: artifact.oldContent,
            newContent: artifact.newContent,
            view: artifact.view,
          });
        }
      } else {
        expect(next.artifacts[0]).toMatchObject({ content: artifact.content });
      }
      expect(next.activeArtifactId).toBe(artifact.id);
    }
  });

  it("keeps other bundle artifacts when one body is edited", () => {
    const draft = createArtifactEditDraft(markdownArtifact);
    draft.content = "# Hello\n\nCorrected notes.";

    const next = applyArtifactEditDraft(
      envelopeFor([markdownArtifact, codeArtifact], "Showcase"),
      draft,
    );

    expect(next.title).toBe("Showcase");
    expect(next.artifacts[0]).toMatchObject({
      id: "notes",
      content: "# Hello\n\nCorrected notes.",
    });
    expect(next.artifacts[1]).toEqual(codeArtifact);
  });

  it("updates a single-artifact envelope title when the heading changes", () => {
    const draft = createArtifactEditDraft(markdownArtifact);
    draft.title = "Corrected notes";

    const next = applyArtifactEditDraft(envelopeFor([markdownArtifact], "Team notes"), draft);

    expect(next.title).toBe("Corrected notes");
    expect(next.artifacts[0]?.id).toBe("notes");
    expect(next.artifacts[0]?.title).toBe("Corrected notes");
  });

  it("preserves pair-diff shape instead of collapsing to a patch", () => {
    const draft = createArtifactEditDraft(pairDiffArtifact);

    expect(draft.diffSource).toBe("pair");
    expect(draft.oldContent).toBe("alpha");
    expect(draft.newContent).toBe("beta");

    draft.newContent = "gamma";
    const next = applyArtifactEditDraft(envelopeFor([pairDiffArtifact]), draft);
    const artifact = next.artifacts[0];

    expect(artifact).toMatchObject({
      id: "pair",
      kind: "diff",
      oldContent: "alpha",
      newContent: "gamma",
      view: "split",
    });
    expect(artifact).not.toHaveProperty("patch");
  });

  it("preserves diff language when rewriting a patch", () => {
    const draft = createArtifactEditDraft(patchDiffArtifact);
    draft.content = `${patchDiffArtifact.patch}+export const version = '0.3.0';\n`;
    draft.diffView = "split";

    const next = applyArtifactEditDraft(envelopeFor([patchDiffArtifact]), draft);

    expect(next.artifacts[0]).toMatchObject({
      id: "release",
      kind: "diff",
      view: "split",
      language: "ts",
    });
  });

  it("rejects empty pair-diff edits with a pair-specific message", () => {
    const draft = createArtifactEditDraft(pairDiffArtifact);
    draft.oldContent = "   ";
    draft.newContent = "";

    expect(() => applyArtifactEditDraft(envelopeFor([pairDiffArtifact]), draft)).toThrow(
      /old or new content/i,
    );
  });

  it("rejects empty edited content", () => {
    const draft = createArtifactEditDraft(jsonArtifact);
    draft.content = "   ";

    expect(() => applyArtifactEditDraft(envelopeFor([jsonArtifact]), draft)).toThrow(
      /paste some content/i,
    );
  });

  it("rejects kind changes and missing artifact ids", () => {
    const draft = createArtifactEditDraft(markdownArtifact);
    draft.kind = "csv";

    expect(() => applyArtifactEditDraft(envelopeFor([markdownArtifact]), draft)).toThrow(
      /kind cannot change/i,
    );

    draft.kind = "markdown";
    draft.artifactId = "missing";
    expect(() => applyArtifactEditDraft(envelopeFor([markdownArtifact]), draft)).toThrow(
      /not in this bundle/i,
    );
  });
});

describe("edited envelope links", () => {
  it("encodes an edited bundle and decodes back to the corrected artifact", async () => {
    const draft = createArtifactEditDraft(codeArtifact);
    draft.content = "export const value = 42;\n";

    const generated = await createGeneratedEnvelopeLinkAsync(
      applyArtifactEditDraft(envelopeFor([codeArtifact, jsonArtifact], "Showcase"), draft),
      "https://agent-render.com/",
      "plain",
    );
    const parsed = await decodeFragmentAsync(generated.hash);

    expect(generated.artifact).toMatchObject({
      id: "shell",
      content: "export const value = 42;\n",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.artifacts).toHaveLength(2);
    expect(parsed.envelope.artifacts[0]).toMatchObject({
      id: "shell",
      content: "export const value = 42;\n",
    });
    expect(parsed.envelope.artifacts[1]).toEqual(jsonArtifact);
  });
});
