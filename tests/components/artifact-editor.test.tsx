import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactEditor } from "@/components/viewer/artifact-editor";
import { buildMarkdownLinkShareInfo } from "@/lib/markdown-link";
import type { GeneratedArtifactLink } from "@/lib/payload/link-creator";
import type { MarkdownArtifact, PayloadEnvelope } from "@/lib/payload/schema";

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
});
