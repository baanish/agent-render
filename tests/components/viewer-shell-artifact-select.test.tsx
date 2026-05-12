import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerShell } from "@/components/viewer-shell";
import type { PayloadEnvelope } from "@/lib/payload/schema";

type DeferredEncode = {
  activeArtifactId: string | undefined;
  reject: (error: Error) => void;
  resolve: (encoded: string) => void;
};

type DecodeCall = {
  hash: string;
  skipFragmentBudget: boolean;
};

const fragmentMock = vi.hoisted((): { decodes: DecodeCall[]; encodes: DeferredEncode[] } => ({
  decodes: [],
  encodes: [],
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

vi.mock("@/components/theme-toggle", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ThemeToggle: () => React.createElement("button", { type: "button" }, "Theme"),
  };
});

vi.mock("@/components/viewer/artifact-stage", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ArtifactStage: ({
      activeArtifact,
      envelope,
      onArtifactSelect,
    }: {
      activeArtifact: PayloadEnvelope["artifacts"][number];
      envelope: PayloadEnvelope;
      onArtifactSelect: (artifactId: string) => void;
    }) =>
      React.createElement(
        "section",
        {
          "data-active-id": activeArtifact.id,
          "data-testid": "mock-artifact-stage",
        },
        envelope.artifacts.map((artifact) =>
          React.createElement(
            "button",
            {
              key: artifact.id,
              onClick: () => onArtifactSelect(artifact.id),
              type: "button",
            },
            `Open ${artifact.id}`,
          ),
        ),
      ),
  };
});

function createEnvelope(activeArtifactId: string): PayloadEnvelope {
  return {
    v: 1,
    codec: "plain",
    activeArtifactId,
    artifacts: [
      { id: "one", kind: "markdown", content: "# One" },
      { id: "two", kind: "markdown", content: "# Two" },
      { id: "three", kind: "markdown", content: "# Three" },
    ],
  };
}

vi.mock("@/lib/payload/fragment", () => ({
  decodeFragmentAsync: vi.fn(async (hash: string, options?: { skipFragmentBudget?: boolean }) => {
    fragmentMock.decodes.push({
      hash,
      skipFragmentBudget: options?.skipFragmentBudget === true,
    });
    const activeArtifactId = hash.includes("three") ? "three" : hash.includes("two") ? "two" : "one";

    return {
      ok: true,
      envelope: createEnvelope(activeArtifactId),
      rawLength: hash.length,
    };
  }),
  encodeEnvelopeAsync: vi.fn((envelope: PayloadEnvelope) => {
    return new Promise<string>((resolve, reject) => {
      fragmentMock.encodes.push({
        activeArtifactId: envelope.activeArtifactId,
        reject,
        resolve,
      });
    });
  }),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/#agent-render=v1.plain.initial");
});

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__AGENT_RENDER_PAYLOAD__;
  fragmentMock.decodes.length = 0;
  fragmentMock.encodes.length = 0;
  vi.clearAllMocks();
});

describe("ViewerShell artifact selection", () => {
  it("keeps the latest artifact selection when async fragment encodes resolve out of order", async () => {
    const user = userEvent.setup();

    render(<ViewerShell />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "one");
    });

    await user.click(screen.getByRole("button", { name: "Open two" }));
    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "two");
    });
    await waitFor(() => expect(fragmentMock.encodes).toHaveLength(1));
    expect(fragmentMock.encodes[0].activeArtifactId).toBe("two");

    await user.click(screen.getByRole("button", { name: "Open three" }));
    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "three");
    });
    await waitFor(() => expect(fragmentMock.encodes).toHaveLength(2));
    expect(fragmentMock.encodes[1].activeArtifactId).toBe("three");

    await act(async () => {
      fragmentMock.encodes[1].resolve("agent-render=v1.plain.three");
    });
    await waitFor(() => expect(window.location.hash).toBe("#agent-render=v1.plain.three"));

    await act(async () => {
      fragmentMock.encodes[0].resolve("agent-render=v1.plain.two");
    });

    await waitFor(() => expect(window.location.hash).toBe("#agent-render=v1.plain.three"));
  });

  it("keeps the selected artifact visible when hash encoding fails", async () => {
    const user = userEvent.setup();

    render(<ViewerShell />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "one");
    });

    await user.click(screen.getByRole("button", { name: "Open two" }));
    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "two");
    });

    await waitFor(() => expect(fragmentMock.encodes).toHaveLength(1));
    await act(async () => {
      fragmentMock.encodes[0].reject(new Error("encode failed"));
    });

    expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "two");
    expect(window.location.hash).toBe("#agent-render=v1.plain.initial");
  });

  it("clears injected payload budget bypass after internal hash navigation", async () => {
    const user = userEvent.setup();
    (window as unknown as Record<string, unknown>).__AGENT_RENDER_PAYLOAD__ =
      "agent-render=v1.plain.initial";

    render(<ViewerShell />);

    await waitFor(() => {
      expect(fragmentMock.decodes[0]).toMatchObject({
        hash: "#agent-render=v1.plain.initial",
        skipFragmentBudget: true,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("mock-artifact-stage")).toHaveAttribute("data-active-id", "one");
    });

    await user.click(screen.getByRole("button", { name: "Open two" }));
    await waitFor(() => expect(fragmentMock.encodes).toHaveLength(1));

    await act(async () => {
      fragmentMock.encodes[0].resolve("agent-render=v1.plain.two");
    });

    await waitFor(() => {
      expect(fragmentMock.decodes.at(-1)).toMatchObject({
        hash: "#agent-render=v1.plain.two",
        skipFragmentBudget: false,
      });
    });
  });
});
