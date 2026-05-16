import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CodeRenderer } from "@/components/renderers/code-renderer";
import type { CodeArtifact } from "@/lib/payload/schema";

type MockEditorStateConfig = {
  doc?: string;
  extensions?: unknown[];
};

const codeRendererMock = vi.hoisted(() => ({
  editorStates: [] as MockEditorStateConfig[],
  pendingLanguageLoads: [] as Array<{
    language: string;
    resolve: (extension: unknown) => void;
  }>,
  rainbowPlugin: { kind: "rainbow-brackets" },
}));

vi.mock("@codemirror/view", () => ({
  EditorView: class MockEditorView {
    static theme() {
      return {};
    }
    static lineWrapping = {};
    static editable = { of: () => ({}) };
    constructor({ state }: { state: MockEditorStateConfig }) {
      codeRendererMock.editorStates.push(state);
    }
    destroy() {}
  },
  highlightActiveLine: () => ({}),
  lineNumbers: () => ({}),
  ViewPlugin: { fromClass: () => codeRendererMock.rainbowPlugin },
  Decoration: { mark: () => ({}), none: { kind: "no-decorations" } },
}));

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: (config: MockEditorStateConfig) => config,
    readOnly: { of: () => ({}) },
  },
  RangeSetBuilder: class {},
}));

vi.mock("@codemirror/language", () => ({
  bracketMatching: () => ({}),
  defaultHighlightStyle: {},
  syntaxTree: () => ({ iterate: () => {} }),
  syntaxHighlighting: () => ({}),
}));

vi.mock("@replit/codemirror-indentation-markers", () => ({
  indentationMarkers: () => ({}),
}));

vi.mock("@/lib/code/language", () => ({
  detectCodeLanguage: (_filename?: string, language?: string) => language || "text",
  loadLanguageSupport: vi.fn((language: string) => {
    return new Promise((resolve: (extension: unknown) => void) => {
      codeRendererMock.pendingLanguageLoads.push({ language, resolve });
    });
  }),
}));

/** Shared controllable matchMedia for tests that need resize / change events. */
function createControllableMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const narrowListeners = new Set<() => void>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const isNarrowQuery = query === "(max-width: 640px)";
      return {
        get matches() {
          return isNarrowQuery ? matches : false;
        },
        media: query,
        onchange: null,
        addEventListener: (type: string, listener: EventListener) => {
          if (isNarrowQuery && type === "change" && typeof listener === "function") {
            narrowListeners.add(listener as () => void);
          }
        },
        removeEventListener: (type: string, listener: EventListener) => {
          if (isNarrowQuery && type === "change") {
            narrowListeners.delete(listener as () => void);
          }
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });

  return {
    setNarrowMatches(next: boolean) {
      matches = next;
      for (const listener of narrowListeners) {
        listener();
      }
    },
  };
}

function createArtifact(overrides: Partial<CodeArtifact> = {}): CodeArtifact {
  return {
    id: "code-artifact",
    kind: "code",
    title: "hello.ts",
    filename: "hello.ts",
    content: 'export const hello = "world";',
    ...overrides,
  };
}

const originalMatchMedia = window.matchMedia;

afterAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
  codeRendererMock.editorStates.length = 0;
  codeRendererMock.pendingLanguageLoads.length = 0;
  vi.restoreAllMocks();
});

describe("CodeRenderer", () => {
  describe("wrap default on wide viewport", () => {
    it("shows Enable wrap button when viewport is wide", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enable wrap/i })).toBeVisible();
      });
    });

    it("toggling wrap changes the button label", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} />);

      const btn = await screen.findByRole("button", { name: /enable wrap/i });
      await userEvent.click(btn);

      expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
    });

    it("enables wrap when the viewport crosses to narrow without a prior manual toggle", async () => {
      const media = createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} />);

      await screen.findByRole("button", { name: /enable wrap/i });

      media.setNarrowMatches(true);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
      });
    });
  });

  describe("wrap default on narrow viewport", () => {
    it("shows Disable wrap button when viewport is narrow", async () => {
      createControllableMatchMedia(true);
      render(<CodeRenderer artifact={createArtifact()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
      });
    });

    it("disables wrap when the viewport crosses to wide without a prior manual toggle", async () => {
      const media = createControllableMatchMedia(true);
      render(<CodeRenderer artifact={createArtifact()} />);

      await screen.findByRole("button", { name: /disable wrap/i });

      media.setNarrowMatches(false);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enable wrap/i })).toBeVisible();
      });
    });
  });

  describe("wrap preference after manual toggle", () => {
    it("keeps the user choice when the viewport changes after a manual toggle", async () => {
      const media = createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} />);

      const enableBtn = await screen.findByRole("button", { name: /enable wrap/i });
      await userEvent.click(enableBtn);

      expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();

      media.setNarrowMatches(true);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
      });
    });
  });

  describe("compact mode", () => {
    it("does not render a toolbar in compact mode", () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} compact />);

      expect(screen.queryByRole("button", { name: /wrap/i })).not.toBeInTheDocument();
    });
  });

  describe("language loading", () => {
    it("does not rebuild the editor when only the ready callback changes", async () => {
      createControllableMatchMedia(false);
      const artifact = createArtifact({ language: "text" });
      const { rerender } = render(<CodeRenderer artifact={artifact} onReady={vi.fn()} />);

      await waitFor(() => {
        expect(codeRendererMock.editorStates.length).toBeGreaterThan(0);
      });
      const editorStateCount = codeRendererMock.editorStates.length;

      rerender(<CodeRenderer artifact={artifact} onReady={vi.fn()} />);
      await act(async () => {});

      expect(codeRendererMock.editorStates).toHaveLength(editorStateCount);
    });

    it("does not reuse a previous language extension while the next language loads", async () => {
      createControllableMatchMedia(false);
      const tsExtension = { language: "ts" };
      const { rerender } = render(<CodeRenderer artifact={createArtifact({ language: "ts" })} />);

      await waitFor(() => {
        expect(codeRendererMock.pendingLanguageLoads.map((load) => load.language)).toContain("ts");
      });
      await act(async () => {
        codeRendererMock.pendingLanguageLoads[0].resolve(tsExtension);
      });
      await waitFor(() => {
        expect(codeRendererMock.editorStates.some((state) => state.extensions?.includes(tsExtension))).toBe(true);
      });

      codeRendererMock.editorStates.length = 0;
      rerender(<CodeRenderer artifact={createArtifact({ content: "{}", filename: "data.json", language: "json" })} />);

      await waitFor(() => {
        expect(codeRendererMock.pendingLanguageLoads.map((load) => load.language)).toContain("json");
        expect(codeRendererMock.editorStates.length).toBeGreaterThan(0);
      });
      expect(codeRendererMock.editorStates.at(-1)?.extensions).not.toContain(tsExtension);
    });
  });

  describe("rainbow bracket plugin", () => {
    it("skips the bracket decoration plugin when content has no bracket tokens", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact({ content: "plain text without paired punctuation" })} />);

      await waitFor(() => {
        expect(codeRendererMock.editorStates.length).toBeGreaterThan(0);
      });
      expect(codeRendererMock.editorStates.at(-1)?.extensions).not.toContain(codeRendererMock.rainbowPlugin);
    });

    it("keeps the bracket decoration plugin when content contains brackets", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact({ content: "const data = { value: [1, 2, 3] };" })} />);

      await waitFor(() => {
        expect(codeRendererMock.editorStates.at(-1)?.extensions).toContain(codeRendererMock.rainbowPlugin);
      });
    });
  });
});
