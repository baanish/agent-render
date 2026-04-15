import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CodeRenderer } from "@/components/renderers/code-renderer";
import type { CodeArtifact } from "@/lib/payload/schema";

vi.mock("@codemirror/view", () => ({
  EditorView: class MockEditorView {
    static theme() {
      return {};
    }
    static lineWrapping = {};
    static editable = { of: () => ({}) };
    constructor() {}
    destroy() {}
  },
  drawSelection: () => ({}),
  highlightActiveLine: () => ({}),
  keymap: { of: () => ({}) },
  lineNumbers: () => ({}),
  ViewPlugin: { fromClass: () => ({}) },
  Decoration: { mark: () => ({}) },
}));

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: () => ({}),
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

vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
}));

vi.mock("@codemirror/search", () => ({
  searchKeymap: [],
}));

vi.mock("@replit/codemirror-indentation-markers", () => ({
  indentationMarkers: () => ({}),
}));

vi.mock("@/lib/code/language", () => ({
  detectCodeLanguage: () => "text",
  loadLanguageSupport: () => Promise.resolve(null),
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
});
