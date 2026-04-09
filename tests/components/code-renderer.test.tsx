import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
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
    value: originalMatchMedia,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CodeRenderer", () => {
  describe("wrap default on wide viewport", () => {
    beforeAll(() => {
      mockMatchMedia(false);
    });

    it("shows Enable wrap button when viewport is wide", async () => {
      render(<CodeRenderer artifact={createArtifact()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /enable wrap/i })).toBeVisible();
      });
    });

    it("toggling wrap changes the button label", async () => {
      render(<CodeRenderer artifact={createArtifact()} />);

      const btn = await screen.findByRole("button", { name: /enable wrap/i });
      await userEvent.click(btn);

      expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
    });
  });

  describe("wrap default on narrow viewport", () => {
    beforeAll(() => {
      mockMatchMedia(true);
    });

    it("shows Disable wrap button when viewport is narrow", async () => {
      render(<CodeRenderer artifact={createArtifact()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
      });
    });
  });

  describe("compact mode", () => {
    beforeAll(() => {
      mockMatchMedia(false);
    });

    it("does not render a toolbar in compact mode", () => {
      render(<CodeRenderer artifact={createArtifact()} compact />);

      expect(screen.queryByRole("button", { name: /wrap/i })).not.toBeInTheDocument();
    });
  });
});
