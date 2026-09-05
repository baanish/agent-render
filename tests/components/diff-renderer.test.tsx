import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DiffRenderer } from "@/components/renderers/diff-renderer";
import type { DiffArtifact } from "@/lib/payload/schema";

const patchDiffMock = vi.fn();
const multiFileDiffMock = vi.fn();
const fileTreeMock = vi.hoisted(() => ({
  options: [] as Array<{
    initialSelectedPaths?: readonly string[];
    onSelectionChange?: (selectedPaths: readonly string[]) => void;
    paths: readonly string[];
  }>,
}));

vi.mock("@pierre/trees/react", () => ({
  FileTree: ({ model }: { model: { paths: readonly string[] } }) => (
    <div data-testid="mock-file-tree">{model.paths.join("|")}</div>
  ),
  useFileTree: (options: {
    initialSelectedPaths?: readonly string[];
    onSelectionChange?: (selectedPaths: readonly string[]) => void;
    paths: readonly string[];
  }) => {
    fileTreeMock.options.push(options);
    return { model: options };
  },
}));

vi.mock("@/lib/diff/pierre-react", () => ({
  PatchDiff: (props: { patch: string }) => {
    patchDiffMock(props);
    return <div data-testid="mock-patch-diff">Rich patch diff</div>;
  },
  MultiFileDiff: (props: { oldFile: { contents: string }; newFile: { contents: string } }) => {
    multiFileDiffMock(props);
    return <div data-testid="mock-multi-file-diff">Rich contents diff</div>;
  },
}));

const validPatch = `diff --git a/src/hello.ts b/src/hello.ts
index 1111111..2222222 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1 +1 @@
-export const hello = "old";
+export const hello = "new";
`;

const multiFilePatch = `${validPatch}
diff --git a/src/second.ts b/src/second.ts
index 3333333..4444444 100644
--- a/src/second.ts
+++ b/src/second.ts
@@ -1 +1 @@
-export const second = "old";
+export const second = "new";
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

// CRLF binary-only patch: no `diff --git`/`---`/`+++`/`@@` anchors, so the unified-diff gate must
// recognize it via the `GIT binary patch` marker alone. Pins the contract that a CRLF binary patch
// still routes to the rich/binary path rather than the raw fallback (regression guard for the
// `\r?$`-tolerant marker regexes in looksLikeUnifiedDiff).
const crlfBinaryPatch = [
  "GIT binary patch",
  "literal 4",
  "Lc${NkF#rGn1ONa4",
  "",
  "",
].join("\r\n");

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
  patchDiffMock.mockClear();
  multiFileDiffMock.mockClear();
  fileTreeMock.options.length = 0;
  vi.restoreAllMocks();
});

describe("DiffRenderer", () => {
  it("keeps the rich diff renderer for valid patches", async () => {
    render(<DiffRenderer artifact={createArtifact()} />);

    await waitFor(() => {
      expect(screen.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "rich");
    });
    expect(screen.queryByText(/could not be rendered as a valid unified diff/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-file-tree")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-patch-diff")).toBeVisible();
    expect(patchDiffMock).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.stringContaining("diff --git") }));
  });

  it("uses a path-aware tree for multi-file patches", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: multiFilePatch })} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-file-tree")).toHaveTextContent("src/hello.ts|src/second.ts");
    });
    expect(fileTreeMock.options.at(-1)).toEqual(
      expect.objectContaining({
        initialSelectedPaths: ["src/hello.ts"],
        paths: ["src/hello.ts", "src/second.ts"],
      }),
    );
  });

  it("renders before-and-after content diffs through the contents path", async () => {
    render(
      <DiffRenderer
        artifact={createArtifact({
          patch: undefined,
          oldContent: 'export const hello = "old";\n',
          newContent: 'export const hello = "new";\n',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "rich");
    });
    expect(screen.getByTestId("mock-multi-file-diff")).toBeVisible();
    expect(multiFileDiffMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldFile: expect.objectContaining({ contents: expect.stringContaining("old") }),
        newFile: expect.objectContaining({ contents: expect.stringContaining("new") }),
      }),
    );
  });

  it("falls back to the raw patch when the diff parser rejects malformed hunks", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<DiffRenderer artifact={createArtifact({ patch: malformedPatch })} />);

    await waitFor(() => {
      expect(screen.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "fallback");
    });
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

  it("does not report fallback readiness again when only the callback identity changes", async () => {
    const artifact = createArtifact({ patch: nonDiffPatch });
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const { rerender } = render(<DiffRenderer artifact={artifact} onReady={firstReady} />);

    await waitFor(() => expect(firstReady).toHaveBeenCalledTimes(1));

    rerender(<DiffRenderer artifact={artifact} onReady={secondReady} />);

    expect(secondReady).not.toHaveBeenCalled();
  });

  it("falls back to the raw patch when the rich diff component throws at render", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    patchDiffMock.mockImplementation(() => {
      throw new Error("shadow root exploded");
    });

    try {
      render(<DiffRenderer artifact={createArtifact()} />);

      await waitFor(() => {
        expect(screen.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "fallback");
      });
      expect(screen.getByText(/could not be rendered as a valid unified diff/i)).toBeVisible();
      expect(screen.getByText(/parser detail: shadow root exploded/i)).toBeVisible();
      expect(screen.getByTestId("renderer-diff-fallback-raw")).toHaveTextContent('export const hello = "new";');
    } finally {
      consoleError.mockRestore();
    }
  });

  it("skips diff rendering for binary patches and keeps the rich renderer shell", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: binaryPatch, filename: "assets/logo.png" })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "rich");
    expect(patchDiffMock).not.toHaveBeenCalled();
    expect(screen.getByText(/binary patch preview is not expanded/i)).toBeVisible();
    expect(screen.queryByText(/could not be rendered as a valid unified diff/i)).not.toBeInTheDocument();
  });

  it("keeps the rich/binary path for a CRLF binary patch instead of the raw fallback", async () => {
    render(<DiffRenderer artifact={createArtifact({ patch: crlfBinaryPatch, filename: "assets/logo.png" })} />);

    const renderer = await screen.findByTestId("renderer-diff");
    expect(renderer).toHaveAttribute("data-diff-state", "rich");
    expect(patchDiffMock).not.toHaveBeenCalled();
    expect(screen.getByText(/binary patch preview is not expanded/i)).toBeVisible();
    expect(screen.queryByTestId("renderer-diff-fallback-raw")).not.toBeInTheDocument();
    expect(screen.queryByText(/not a valid unified diff/i)).not.toBeInTheDocument();
  });

  it("copies the raw patch from the fallback view", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(<DiffRenderer artifact={createArtifact({ patch: nonDiffPatch })} />);

    await userEvent.click(await screen.findByRole("button", { name: /copy raw diff/i }));

    expect(writeText).toHaveBeenCalledWith(nonDiffPatch);
    expect(screen.getByRole("button", { name: /copied raw diff/i })).toBeVisible();
  });

  it("uses the shared clipboard fallback when copying a raw diff", async () => {
    const originalExecCommand = document.execCommand;
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    try {
      render(<DiffRenderer artifact={createArtifact({ patch: nonDiffPatch })} />);

      await userEvent.click(await screen.findByRole("button", { name: /copy raw diff/i }));

      expect(execCommand).toHaveBeenCalledWith("copy");
      expect(screen.getByRole("button", { name: /copied raw diff/i })).toBeVisible();
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
    }
  });
});
