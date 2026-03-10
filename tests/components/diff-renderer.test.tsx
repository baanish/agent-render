import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DiffFile } from "@git-diff-view/react";
import { DiffRenderer } from "@/components/renderers/diff-renderer";
import type { DiffArtifact } from "@/lib/payload/schema";

vi.mock("@git-diff-view/react", async () => {
  const actual = await vi.importActual<typeof import("@git-diff-view/react")>("@git-diff-view/react");

  return {
    ...actual,
    DiffView: () => <div data-testid="mock-rich-diff-view">Rich diff view</div>,
  };
});

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const validPatch = `diff --git a/src/hello.ts b/src/hello.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1 +1 @@
-export const hello = "old";
+export const hello = "new";
`;

const malformedPatch = `diff --git a/src/hello.ts b/src/hello.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ invalid @@
-export const hello = "old";
+export const hello = "new";
`;

const nonDiffPatch = `this is not a unified diff
just some text that should stay readable
`;

const binaryPatch = `diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..1111111
Binary files /dev/null and b/assets/logo.png differ
`;

function createArtifact(overrides: Partial<DiffArtifact> = {}): DiffArtifact {
  return {
    id: "diff-artifact",
    kind: "diff",
    title: "hello.ts diff",
    filename: "src/hello.ts",
    patch: validPatch,
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: originalMatchMedia,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DiffRenderer", () => {
  it("keeps the rich diff renderer for valid patches", async () => {
    render(<DiffRenderer artifact={createArtifact()} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "rich");
    expect(screen.queryByText(/could not be rendered as a valid unified diff/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/hello\.ts/i })).toBeVisible();
    expect(screen.getByTestId("mock-rich-diff-view")).toBeVisible();
  });

  it("falls back to the raw patch when the diff parser rejects malformed hunks", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<DiffRenderer artifact={createArtifact({ patch: malformedPatch })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "fallback");
    expect(screen.getByText(/could not be rendered as a valid unified diff/i)).toBeVisible();
    expect(screen.getByTestId("renderer-diff-fallback-raw")).toHaveTextContent("@@ invalid @@");

    consoleError.mockRestore();
  });

  it("falls back cleanly when the payload is not a unified diff at all", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: nonDiffPatch })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "fallback");
    expect(screen.getByText(/not a valid unified diff/i)).toBeVisible();
    expect(screen.getByTestId("renderer-diff-fallback-raw")).toHaveTextContent("this is not a unified diff");
  });

  it("falls back to the raw patch when the diff library throws during parsing", async () => {
    vi.spyOn(DiffFile.prototype, "init").mockImplementation(() => {
      throw new Error("Invalid hunk header format");
    });

    render(<DiffRenderer artifact={createArtifact()} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "fallback");
    expect(screen.getByText(/could not be rendered as a valid unified diff/i)).toBeVisible();
    expect(screen.getByText(/parser detail: Invalid hunk header format/i)).toBeVisible();
    expect(screen.getByTestId("renderer-diff-fallback-raw")).toHaveTextContent('export const hello = "new";');
  });

  it("skips diff parsing for binary patches and keeps the rich renderer shell", async () => {
    const initSpy = vi.spyOn(DiffFile.prototype, "init");

    render(<DiffRenderer artifact={createArtifact({ patch: binaryPatch, filename: "assets/logo.png" })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "rich");
    expect(initSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/binary patch preview is not expanded/i)).toBeVisible();
    expect(screen.queryByText(/could not be rendered as a valid unified diff/i)).not.toBeInTheDocument();
  });

  it("copies the raw patch from the fallback view", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(<DiffRenderer artifact={createArtifact({ patch: malformedPatch })} />);

    await userEvent.click(await screen.findByRole("button", { name: /copy raw diff/i }));

    expect(writeText).toHaveBeenCalledWith(malformedPatch);
    expect(screen.getByRole("button", { name: /copied raw diff/i })).toBeVisible();
  });
});
