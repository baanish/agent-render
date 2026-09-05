import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CodeRenderer } from "@/components/renderers/code-renderer";
import type { CodeArtifact } from "@/lib/payload/schema";

type MockFileProps = {
  file: { name: string; contents: string; lang?: string };
  options?: {
    overflow?: "scroll" | "wrap";
    disableFileHeader?: boolean;
    onPostRender?: (node: HTMLElement, instance: unknown, phase: string) => void;
  };
};

const codeRendererMock = vi.hoisted(() => ({
  renders: [] as MockFileProps[],
}));

vi.mock("@/lib/diff/pierre-react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    File: (props: MockFileProps) => {
      codeRendererMock.renders.push(props);
      const onPostRender = props.options?.onPostRender;
      React.useEffect(() => {
        onPostRender?.(document.createElement("div"), {}, "mount");
      }, [onPostRender]);
      return React.createElement(
        "pre",
        { "data-testid": "mock-pierre-file" },
        props.file.contents,
      );
    },
  };
});

vi.mock("@/lib/code/language", () => ({
  detectCodeLanguage: (_filename?: string, language?: string) => language || "text",
  toPierreLanguage: (language: string) => language,
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

function lastFileProps() {
  return codeRendererMock.renders.at(-1);
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
  codeRendererMock.renders.length = 0;
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
      expect(lastFileProps()?.options?.overflow).toBe("scroll");
    });

    it("toggling wrap changes the button label and Pierre overflow", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} />);

      const btn = await screen.findByRole("button", { name: /enable wrap/i });
      await userEvent.click(btn);

      expect(screen.getByRole("button", { name: /disable wrap/i })).toBeVisible();
      await waitFor(() => {
        expect(lastFileProps()?.options?.overflow).toBe("wrap");
      });
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
      await waitFor(() => {
        expect(lastFileProps()?.options?.overflow).toBe("wrap");
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
    it("hides the wrap toolbar and file header", async () => {
      createControllableMatchMedia(false);
      render(<CodeRenderer artifact={createArtifact()} compact />);

      expect(screen.queryByRole("button", { name: /wrap/i })).not.toBeInTheDocument();
      await waitFor(() => {
        expect(lastFileProps()?.options?.disableFileHeader).toBe(true);
        expect(lastFileProps()?.options?.overflow).toBe("scroll");
      });
    });
  });

  describe("pierre file surface", () => {
    it("passes the artifact through to the File item and reports ready on mount", async () => {
      createControllableMatchMedia(false);
      const onReady = vi.fn();
      render(<CodeRenderer artifact={createArtifact()} onReady={onReady} />);

      await waitFor(() => {
        expect(screen.getByTestId("renderer-code")).toHaveAttribute(
          "data-renderer-ready",
          "true",
        );
      });
      expect(onReady).toHaveBeenCalled();
      expect(lastFileProps()?.file).toMatchObject({
        name: "hello.ts",
        contents: 'export const hello = "world";',
        lang: "text",
      });
    });

    it("does not report readiness again when only the callback identity changes", async () => {
      createControllableMatchMedia(false);
      const artifact = createArtifact({ language: "text" });
      const firstReady = vi.fn();
      const secondReady = vi.fn();
      const { rerender } = render(<CodeRenderer artifact={artifact} onReady={firstReady} />);

      await waitFor(() => expect(firstReady).toHaveBeenCalledTimes(1));

      rerender(<CodeRenderer artifact={artifact} onReady={secondReady} />);
      await act(async () => {});

      expect(secondReady).not.toHaveBeenCalled();
      expect(firstReady).toHaveBeenCalledTimes(1);
    });
  });
});
