import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactStage } from "@/components/viewer/artifact-stage";
import type {
  ArtifactPayload,
  PayloadEnvelope,
} from "@/lib/payload/schema";

vi.mock("@/components/viewer/artifact-body-editor", () => ({
  ArtifactBodyEditor: ({
    documents,
    onDocumentChange,
  }: {
    documents: readonly { id: string; contents: string }[];
    onDocumentChange: (id: string, contents: string) => void;
  }) => (
    <div data-testid="mock-body-editor">
      {documents.map((doc) => (
        <textarea
          key={doc.id}
          data-testid="artifact-editor-content"
          defaultValue={doc.contents}
          onChange={(event) => onDocumentChange(doc.id, event.target.value)}
        />
      ))}
    </div>
  ),
}));

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

function renderStage(activeArtifact: ArtifactPayload) {
  const envelope: PayloadEnvelope = {
    v: 1,
    codec: "plain",
    activeArtifactId: activeArtifact.id,
    artifacts: [activeArtifact],
  };

  return render(
    <ArtifactStage
      activeArtifact={activeArtifact}
      envelope={envelope}
      fragmentLength={42}
      hash="#agent-render=v1.plain.sample"
      onArtifactSelect={vi.fn()}
      onPreviewHash={vi.fn()}
      onRendererReady={vi.fn()}
      rendererReadyKey="ready"
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("ArtifactStage raw view", () => {
  it("renders markdown raw mode as un-highlighted plain text without mounting CodeMirror", async () => {
    renderStage({
      id: "markdown-artifact",
      kind: "markdown",
      title: "Notes",
      content: "# Heading\n\nraw markdown body",
    });

    await userEvent.click(screen.getByRole("button", { name: "Raw" }));

    expect(screen.getByTestId("renderer-markdown-raw")).toHaveTextContent(
      "raw markdown body",
    );
    expect(document.querySelector(".cm-editor")).not.toBeInTheDocument();
  });

  it("renders csv raw mode as un-highlighted plain text without mounting CodeMirror", async () => {
    renderStage({
      id: "csv-artifact",
      kind: "csv",
      title: "export.csv",
      content: "name,status\nviewer,ready",
    });

    await userEvent.click(screen.getByRole("button", { name: "Raw" }));

    expect(screen.getByTestId("renderer-csv-raw")).toHaveTextContent(
      "name,status",
    );
    expect(document.querySelector(".cm-editor")).not.toBeInTheDocument();
  });

  it("opens the in-viewer editor with the current artifact body", async () => {
    renderStage({
      id: "markdown-artifact",
      kind: "markdown",
      title: "Notes",
      content: "# Heading\n\nraw markdown body",
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByTestId("artifact-editor")).toBeInTheDocument();
    expect(screen.getByTestId("artifact-editor-content")).toHaveValue(
      "# Heading\n\nraw markdown body",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
