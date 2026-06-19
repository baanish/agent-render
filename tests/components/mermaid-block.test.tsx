import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidBlock } from "@/components/renderers/mermaid-block";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: "<svg data-testid=\"mermaid-svg\"></svg>" })),
}));

vi.mock("mermaid", () => ({
  default: mermaidMock,
}));

afterEach(() => {
  cleanup();
  mermaidMock.initialize.mockClear();
  mermaidMock.render.mockClear();
  vi.restoreAllMocks();
});

describe("MermaidBlock", () => {
  it("does not rerender the diagram when only the ready callback changes", async () => {
    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" onReady={vi.fn()} />);

    await waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    rerender(<MermaidBlock code="graph TD; A-->B" onReady={vi.fn()} />);
    await act(async () => {});

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
  });
});
