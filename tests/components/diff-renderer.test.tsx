import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DiffRenderer } from "@/components/renderers/diff-renderer";
import type { DiffArtifact } from "@/lib/payload/schema";

vi.mock("@/lib/diff/pierre-react", () => {
  return {
    PatchDiff: () => <div data-testid="mock-rich-diff-view">Rich diff view</div>,
    MultiFileDiff: () => <div data-testid="mock-rich-diff-view">Rich diff view</div>,
    FileDiff: () => <div data-testid="mock-rich-diff-view">Rich diff view</div>,
  };
});

const validPatch = `diff --git a/src/hello.ts b/src/hello.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1 +1 @@
-export const hello = "old";
+export const hello = "new";
`;

const nonDiffPatch = `this is not a unified diff
just some text that should stay readable
`;

const binaryPatch = `diff --git a/assets/logo.png b/assets/logo.png
index 1111111..2222222 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

function createArtifact(overrides: Partial<DiffArtifact> = {}): DiffArtifact {
  return {
    id: "diff-1",
    kind: "diff",
    title: "Sample diff",
    filename: "src/hello.ts",
    patch: validPatch,
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

afterEach(() => {
  cleanup();
});

describe("DiffRenderer", () => {
  it("renders the rich diff shell for valid patches", async () => {
    render(<DiffRenderer artifact={createArtifact()} />);

    await waitFor(() => {
      expect(screen.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "rich");
    });
    expect(screen.getByRole("heading", { name: /src\/hello\.ts/i })).toBeVisible();
    expect(screen.getByTestId("mock-rich-diff-view")).toBeVisible();
  });

  it("keeps binary patches in the rich state with a preview note", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: binaryPatch, filename: "assets/logo.png" })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "rich");
    expect(screen.getByText(/binary patch preview is not expanded/i)).toBeVisible();
    expect(screen.queryByText(/could not be rendered as a valid unified diff/i)).not.toBeInTheDocument();
  });

  it("falls back to the raw patch when the patch is not a unified diff", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: nonDiffPatch })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "fallback");
    expect(screen.getByText(/not a valid unified diff/i)).toBeVisible();
    expect(screen.getByTestId("renderer-diff-fallback-raw")).toHaveTextContent("this is not a unified diff");
  });

  it("copies the raw patch from the fallback view", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(<DiffRenderer artifact={createArtifact({ patch: nonDiffPatch })} />);

    const copyButton = await screen.findByRole("button", { name: /^(Copy|Copied)$/i });
    await userEvent.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(nonDiffPatch);
  });
});
