import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactStage } from "@/components/viewer/artifact-stage";
import type {
  ArtifactPayload,
  PayloadEnvelope,
} from "@/lib/payload/schema";

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

const statusTone = {
  color: "#000000",
  label: "Ready",
  message: "Decoded fragment.",
};

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
      onRendererReady={vi.fn()}
      rendererReadyKey="ready"
      statusTone={statusTone}
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
});
