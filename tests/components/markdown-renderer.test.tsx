import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/renderers/markdown-renderer";
import type { CodeArtifact, MarkdownArtifact } from "@/lib/payload/schema";

function createArtifact(overrides: Partial<MarkdownArtifact> = {}): MarkdownArtifact {
  return {
    id: "markdown-artifact",
    kind: "markdown",
    title: "Notes",
    content: "Plain markdown",
    ...overrides,
  };
}

vi.mock("next/dynamic", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
      return function DynamicTestComponent(props: Record<string, unknown>) {
        const [Component, setComponent] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null);

        React.useEffect(() => {
          let mounted = true;

          void loader().then((loadedComponent) => {
            if (mounted) {
              setComponent(() => loadedComponent);
            }
          });

          return () => {
            mounted = false;
          };
        }, []);

        return Component ? React.createElement(Component, props) : null;
      };
    },
  };
});

vi.mock("@/components/renderers/code-renderer", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    CodeRenderer: ({ artifact, onReady }: { artifact: CodeArtifact; onReady?: () => void }) => {
      React.useEffect(() => {
        onReady?.();
      }, [onReady]);

      return React.createElement("pre", { "data-language": artifact.language, "data-testid": "mock-code-renderer" }, artifact.content);
    },
  };
});

afterEach(() => {
  cleanup();
});

describe("MarkdownRenderer", () => {
  it("renders language-less fenced code blocks through the embedded code renderer", async () => {
    const onReady = vi.fn();

    render(<MarkdownRenderer artifact={createArtifact({ content: "```\nplain text\n```" })} onReady={onReady} />);

    const embeddedCode = await screen.findByTestId("mock-code-renderer");
    expect(embeddedCode).toHaveAttribute("data-language", "text");
    expect(embeddedCode).toHaveTextContent("plain text");

    await waitFor(() => {
      expect(screen.getByTestId("renderer-markdown")).toHaveAttribute("data-renderer-ready", "true");
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("waits for every fenced code block before reporting ready", async () => {
    const onReady = vi.fn();

    const { container } = render(
      <MarkdownRenderer
        artifact={createArtifact({
          content: "```ts\nconst a = 1;\n```\n\n```json\n{\"ok\":true}\n```",
        })}
        onReady={onReady}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".markdown-code-frame")).toHaveLength(2);
    });

    await waitFor(() => {
      expect(screen.getByTestId("renderer-markdown")).toHaveAttribute("data-renderer-ready", "true");
      expect(onReady).toHaveBeenCalled();
    });
  });

  it("does not wait forever on tilde blocks that are not mounted as embedded renderers", async () => {
    const onReady = vi.fn();

    render(
      <MarkdownRenderer
        artifact={createArtifact({
          content: "~~~json\n{\"ok\":true}\n~~~",
        })}
        onReady={onReady}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("renderer-markdown")).toHaveAttribute("data-renderer-ready", "true");
      expect(onReady).toHaveBeenCalled();
    });
  });
});
