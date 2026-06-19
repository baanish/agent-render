import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkCreator } from "@/components/home/link-creator";
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
    hash: `#agent-render=v1.plain.${title}`,
    url: `https://agent-render.test/#agent-render=v1.plain.${title}`,
  };
}

afterEach(() => {
  cleanup();
  generationMock.pending.length = 0;
  vi.restoreAllMocks();
});

describe("LinkCreator", () => {
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
});
