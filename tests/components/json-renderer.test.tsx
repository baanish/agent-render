import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonRenderer } from "@/components/renderers/json-renderer";
import type { JsonArtifact } from "@/lib/payload/schema";

function createArtifact(overrides: Partial<JsonArtifact> = {}): JsonArtifact {
  return {
    id: "json-artifact",
    kind: "json",
    title: "manifest.json",
    filename: "manifest.json",
    content: '{\n  "name": "agent-render",\n  "static": true\n}',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("JsonRenderer", () => {
  it("renders the parsed tree by default", async () => {
    const onReady = vi.fn();

    render(<JsonRenderer artifact={createArtifact()} onReady={onReady} />);

    expect(screen.getByTestId("renderer-json")).toHaveAttribute("data-renderer-ready", "true");
    expect(screen.getByText("Object(2)")).toBeVisible();
    expect(screen.queryByTestId("renderer-json-raw")).not.toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it("does not report readiness again when only the callback identity changes", async () => {
    const artifact = createArtifact();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const { rerender } = render(<JsonRenderer artifact={artifact} onReady={firstReady} />);

    await waitFor(() => expect(firstReady).toHaveBeenCalledTimes(1));

    rerender(<JsonRenderer artifact={artifact} onReady={secondReady} />);

    expect(secondReady).not.toHaveBeenCalled();
  });

  it("switches to a native raw source view without mounting CodeMirror", async () => {
    render(<JsonRenderer artifact={createArtifact()} />);

    await userEvent.click(screen.getByRole("button", { name: "Raw" }));

    expect(screen.getByTestId("renderer-json-raw")).toHaveTextContent('"name": "agent-render"');
    expect(document.querySelector(".cm-editor")).not.toBeInTheDocument();
  });

  it("renders array nodes with numeric child labels", () => {
    render(<JsonRenderer artifact={createArtifact({ content: '{ "items": ["alpha", "beta"] }' })} />);

    expect(screen.getByText("Array(2)")).toBeVisible();
    expect(screen.getByText("0")).toBeVisible();
    expect(screen.getByText("alpha")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
    expect(screen.getByText("beta")).toBeVisible();
  });

  it("shows invalid JSON as raw source with the parse error", () => {
    render(<JsonRenderer artifact={createArtifact({ content: "{ nope" })} />);

    expect(screen.getByText(/expected property name/i)).toBeVisible();
    expect(screen.getByTestId("renderer-json-raw")).toHaveTextContent("{ nope");
  });
});
