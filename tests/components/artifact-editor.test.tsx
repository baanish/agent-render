import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactEditor } from "@/components/viewer/artifact-editor";
import { buildMarkdownLinkShareInfo } from "@/lib/markdown-link";
import type { GeneratedArtifactLink } from "@/lib/payload/link-creator";
import type { DiffArtifact, MarkdownArtifact, PayloadEnvelope } from "@/lib/payload/schema";

const generationMock = vi.hoisted(() => ({
  createGeneratedEnvelopeLinkAsync: vi.fn(),
}));

vi.mock("@/lib/payload/link-creator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payload/link-creator")>(
    "@/lib/payload/link-creator",
  );

  return {
    ...actual,
    createGeneratedEnvelopeLinkAsync: (...args: unknown[]) =>
      generationMock.createGeneratedEnvelopeLinkAsync(...args),
  };
});

vi.mock("@/components/file-tree-nav", () => ({
  FileTreeNav: ({
    paths,
    onSelectPath,
  }: {
    paths: readonly string[];
    onSelectPath: (path: string) => void;
  }) => (
    <div data-testid="mock-patch-file-tree">
      {paths.map((path) => (
        <button key={path} type="button" onClick={() => onSelectPath(path)}>
          {path}
        </button>
      ))}
    </div>
  ),
}));

const markdownArtifact: MarkdownArtifact = {
  id: "notes",
  kind: "markdown",
  title: "Team notes",
  filename: "notes.md",
  content: "# Hello\n\nOriginal notes.",
};

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Team notes",
  activeArtifactId: "notes",
  artifacts: [markdownArtifact],
};

function createGeneratedLink(content: string): GeneratedArtifactLink {
  const url = "https://agent-render.test/#pcorrected";
  const shareInfo = buildMarkdownLinkShareInfo("Team notes", url);

  return {
    artifact: {
      ...markdownArtifact,
      content,
    },
    codec: "plain",
    envelope: {
      ...envelope,
      artifacts: [{ ...markdownArtifact, content }],
    },
    fragmentLength: 48,
    hash: "#pcorrected",
    url,
    markdownUrl: url,
    markdownLink: shareInfo.markdownLink,
    markdownLinkLength: shareInfo.length,
    discordMarkdownLinkWarning: shareInfo.discordWarning,
  };
}

afterEach(() => {
  cleanup();
  generationMock.createGeneratedEnvelopeLinkAsync.mockReset();
  vi.restoreAllMocks();
});

describe("ArtifactEditor", () => {
  it("pre-fills the open artifact and previews a newly generated link", async () => {
    const user = userEvent.setup();
    const onPreviewHash = vi.fn();
    generationMock.createGeneratedEnvelopeLinkAsync.mockResolvedValue(
      createGeneratedLink("# Hello\n\nCorrected notes."),
    );

    render(
      <ArtifactEditor
        artifact={markdownArtifact}
        envelope={envelope}
        onPreviewHash={onPreviewHash}
      />,
    );

    const content = screen.getByTestId("artifact-editor-content");
    expect(content).toHaveValue("# Hello\n\nOriginal notes.");

    await user.clear(content);
    await user.type(content, "# Hello{enter}{enter}Corrected notes.");
    await user.click(screen.getByRole("button", { name: "Generate new link" }));

    await waitFor(() => expect(generationMock.createGeneratedEnvelopeLinkAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("artifact-editor-result")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview here" }));
    expect(onPreviewHash).toHaveBeenCalledWith("#pcorrected");
  });

  it("disables reshare actions after the draft changes", async () => {
    const user = userEvent.setup();
    const onPreviewHash = vi.fn();
    generationMock.createGeneratedEnvelopeLinkAsync.mockResolvedValue(
      createGeneratedLink("# Hello\n\nCorrected notes."),
    );

    render(
      <ArtifactEditor
        artifact={markdownArtifact}
        envelope={envelope}
        onPreviewHash={onPreviewHash}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate new link" }));
    expect(await screen.findByTestId("artifact-editor-result")).toBeInTheDocument();

    await user.type(screen.getByTestId("artifact-editor-content"), " more");

    expect(screen.getByRole("button", { name: "Preview here" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/draft changed/i);

    await user.click(screen.getByRole("button", { name: "Preview here" }));
    expect(onPreviewHash).not.toHaveBeenCalled();
  });

  it("surfaces generation errors without offering a preview", async () => {
    const user = userEvent.setup();
    generationMock.createGeneratedEnvelopeLinkAsync.mockRejectedValue(
      new Error("This link needs 9,000 fragment characters, which is over the 8,192 character limit."),
    );

    render(
      <ArtifactEditor
        artifact={markdownArtifact}
        envelope={envelope}
        onPreviewHash={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Generate new link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/8,192 character limit/i);
    expect(screen.queryByTestId("artifact-editor-result")).not.toBeInTheDocument();
  });

  const multiFilePatch = `diff --git a/src/hello.ts b/src/hello.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1 +1 @@
-export const hello = "old";
+export const hello = "new";
diff --git a/src/second.ts b/src/second.ts
index 3333333..4444444 100644
--- a/src/second.ts
+++ b/src/second.ts
@@ -1 +1 @@
-export const second = "old";
+export const second = "new";
`;

  const diffArtifact: DiffArtifact = {
    id: "diff-artifact",
    kind: "diff",
    title: "release.patch",
    filename: "release.patch",
    patch: multiFilePatch,
  };

  const diffEnvelope: PayloadEnvelope = {
    v: 1,
    codec: "plain",
    title: "release.patch",
    activeArtifactId: "diff-artifact",
    artifacts: [diffArtifact],
  };

  it("lists the edited artifact in the tree for a single-file patch", async () => {
    const singleFileArtifact: DiffArtifact = {
      ...diffArtifact,
      patch: multiFilePatch.slice(0, multiFilePatch.indexOf("diff --git a/src/second.ts")),
    };
    const singleFileEnvelope: PayloadEnvelope = {
      ...diffEnvelope,
      artifacts: [singleFileArtifact],
    };

    render(
      <ArtifactEditor
        artifact={singleFileArtifact}
        envelope={singleFileEnvelope}
        onPreviewHash={vi.fn()}
      />,
    );

    const tree = await screen.findByTestId("mock-patch-file-tree");
    expect(tree).toHaveTextContent("release.patch");
    expect(tree).not.toHaveTextContent("src/hello.ts");
    expect(screen.getByTestId("artifact-editor-content")).toBeInTheDocument();
  });

  it("adds patch files to the tree and moves the caret on selection", async () => {
    const user = userEvent.setup();

    render(
      <ArtifactEditor
        artifact={diffArtifact}
        envelope={diffEnvelope}
        onPreviewHash={vi.fn()}
      />,
    );

    const tree = await screen.findByTestId("mock-patch-file-tree");
    expect(tree).toHaveTextContent("release.patch");
    expect(tree).toHaveTextContent("src/hello.ts");
    expect(tree).toHaveTextContent("src/second.ts");

    const textarea = screen.getByTestId<HTMLTextAreaElement>("artifact-editor-content");
    await user.click(screen.getByRole("button", { name: "src/second.ts" }));

    const expectedOffset = multiFilePatch.indexOf("diff --git a/src/second.ts");
    expect(textarea.selectionStart).toBe(expectedOffset);
    expect(document.activeElement).toBe(textarea);
  });

  it("switches the edit target through the tree without losing drafts", async () => {
    const user = userEvent.setup();
    const bundleEnvelope: PayloadEnvelope = {
      v: 1,
      codec: "plain",
      title: "Release bundle",
      activeArtifactId: "notes",
      artifacts: [markdownArtifact, diffArtifact],
    };

    render(
      <ArtifactEditor
        artifact={markdownArtifact}
        envelope={bundleEnvelope}
        onPreviewHash={vi.fn()}
      />,
    );

    const tree = await screen.findByTestId("mock-patch-file-tree");
    expect(tree).toHaveTextContent("notes.md");
    expect(tree).toHaveTextContent("release.patch");

    const content = screen.getByTestId<HTMLTextAreaElement>("artifact-editor-content");
    await user.clear(content);
    await user.type(content, "# Edited notes");

    await user.click(screen.getByRole("button", { name: "release.patch" }));
    expect(screen.getByTestId<HTMLTextAreaElement>("artifact-editor-content")).toHaveValue(
      multiFilePatch,
    );
    expect(screen.getByLabelText("Diff view")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "notes.md" }));
    expect(screen.getByTestId<HTMLTextAreaElement>("artifact-editor-content")).toHaveValue(
      "# Edited notes",
    );
  });

  it("keeps the pair editor for old/new content diffs", () => {
    const pairArtifact: DiffArtifact = {
      ...diffArtifact,
      patch: undefined,
      oldContent: "old\n",
      newContent: "new\n",
    };
    const pairEnvelope: PayloadEnvelope = {
      ...diffEnvelope,
      artifacts: [pairArtifact],
    };

    render(
      <ArtifactEditor
        artifact={pairArtifact}
        envelope={pairEnvelope}
        onPreviewHash={vi.fn()}
      />,
    );

    expect(screen.getByTestId("artifact-editor-old-content")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-editor-new-content")).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-editor-content")).not.toBeInTheDocument();
  });
});
