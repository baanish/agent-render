import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkCreator } from "@/components/home/link-creator";
import { buildMarkdownLinkShareInfo } from "@/lib/markdown-link";
import type { GeneratedArtifactLink, LinkCreatorDraft } from "@/lib/payload/link-creator";

type PendingGeneration = {
  draft: LinkCreatorDraft;
  resolve: (link: GeneratedArtifactLink) => void;
  reject: (error: Error) => void;
};

const generationMock = vi.hoisted(() => ({
  pending: [] as PendingGeneration[],
}));

vi.mock("@/lib/payload/link-creator", () => ({
  createGeneratedArtifactLinkAsync: vi.fn((draft: LinkCreatorDraft) => {
    return new Promise<GeneratedArtifactLink>((resolve, reject) => {
      generationMock.pending.push({ draft, resolve, reject });
    });
  }),
}));

function createGeneratedLink(title: string): GeneratedArtifactLink {
  const url = `https://agent-render.test/#p${title}`;
  const shareInfo = buildMarkdownLinkShareInfo(title, url);

  return {
    artifact: {
      id: title.toLowerCase().replace(/\s+/g, "-"),
      kind: "markdown",
      title,
      filename: "brief.md",
      content: `# ${title}`,
    },
    codec: "plain",
    envelope: {
      v: 1,
      codec: "plain",
      title,
      activeArtifactId: title.toLowerCase().replace(/\s+/g, "-"),
      artifacts: [],
    },
    fragmentLength: 64,
    hash: `#p${title}`,
    url,
    markdownUrl: url,
    markdownLink: shareInfo.markdownLink,
    markdownLinkLength: shareInfo.length,
    discordMarkdownLinkWarning: shareInfo.discordWarning,
  };
}

afterEach(() => {
  cleanup();
  generationMock.pending.length = 0;
  vi.restoreAllMocks();
});

describe("LinkCreator", () => {
  it("offers every registered codec in the compression selector", () => {
    render(<LinkCreator onPreviewHash={vi.fn()} />);

    for (const option of ["auto", "plain", "lz", "deflate", "arx", "arx2", "arx5"]) {
      expect(screen.getByRole("button", { name: option })).toBeInTheDocument();
    }

    expect(screen.getByRole("button", { name: "arx3 (do not use)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "arx4 (do not use)" })).toBeInTheDocument();
  });

  it("keeps the newest generated link when async requests resolve out of order", async () => {
    const user = userEvent.setup();

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(generationMock.pending).toHaveLength(1));

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Fresh brief");
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(generationMock.pending).toHaveLength(2));

    await act(async () => {
      generationMock.pending[1].resolve(createGeneratedLink("Fresh brief"));
    });

    expect(screen.getByLabelText<HTMLTextAreaElement>("Generated agent-render link").value).toContain("Fresh brief");

    await act(async () => {
      generationMock.pending[0].resolve(createGeneratedLink("Stale brief"));
    });

    expect(screen.getByLabelText<HTMLTextAreaElement>("Generated agent-render link").value).toContain("Fresh brief");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Generated agent-render link").value).not.toContain("Stale brief");
  });

  it("keeps generated links fresh when the user reselects the current draft option", async () => {
    const user = userEvent.setup();

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(generationMock.pending).toHaveLength(1));

    await act(async () => {
      generationMock.pending[0].resolve(createGeneratedLink("Product brief"));
    });

    expect(screen.queryByText("Draft changed since last generation.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "markdown" }));
    await user.click(screen.getByRole("button", { name: "auto" }));

    expect(screen.queryByText("Draft changed since last generation.")).not.toBeInTheDocument();
  });

  it("marks a generated link stale after the draft changes", async () => {
    const user = userEvent.setup();

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(generationMock.pending).toHaveLength(1));

    await act(async () => {
      generationMock.pending[0].resolve(createGeneratedLink("Product brief"));
    });

    await user.type(screen.getByLabelText("Title"), " updated");

    expect(screen.getByText("Draft changed since last generation.")).toBeVisible();
  });

  it("loads a local file into the draft without generating a link", async () => {
    const user = userEvent.setup();

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    const file = new File(["print('ready')\n"], "hello.py", {
      type: "text/x-python",
    });
    await user.upload(screen.getByLabelText("Load a local file"), file);

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("hello");
    });
    expect(screen.getByLabelText("Filename")).toHaveValue("hello.py");
    expect(screen.getByLabelText("Content")).toHaveValue("print('ready')\n");
    expect(screen.getByRole("button", { name: "code" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Language")).toHaveValue("python");
    expect(screen.queryByLabelText("Generated agent-render link")).not.toBeInTheDocument();
  });

  it("keeps the newest local file when reads resolve out of order", async () => {
    const user = userEvent.setup();
    let releaseSlow = () => {};
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const originalText = File.prototype.text;
    vi.spyOn(File.prototype, "text").mockImplementation(async function (this: File) {
      if (this.name === "slow.md") {
        await slowGate;
      }
      return originalText.call(this);
    });

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    await user.upload(
      screen.getByLabelText("Load a local file"),
      new File(["# Slow\n"], "slow.md", { type: "text/markdown" }),
    );
    await user.upload(
      screen.getByLabelText("Load a local file"),
      new File(["# Fast\n"], "fast.md", { type: "text/markdown" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Filename")).toHaveValue("fast.md");
    });

    await act(async () => {
      releaseSlow();
    });

    expect(screen.getByLabelText("Filename")).toHaveValue("fast.md");
    expect(screen.getByLabelText("Content")).toHaveValue("# Fast\n");
    expect(screen.getByLabelText("Title")).toHaveValue("fast");
  });

  it("reports a binary file instead of replacing the draft", async () => {
    const user = userEvent.setup();

    render(<LinkCreator onPreviewHash={vi.fn()} />);

    const file = new File(["ok\0still"], "notes.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("Load a local file"), file);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This file looks binary. Choose a text file.",
      );
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Product brief");
    expect(screen.getByLabelText("Filename")).toHaveValue("brief.md");
  });
});
