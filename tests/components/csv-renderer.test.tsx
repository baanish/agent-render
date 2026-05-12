import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CsvRenderer } from "@/components/renderers/csv-renderer";
import type { CsvArtifact } from "@/lib/payload/schema";

function createArtifact(content: string): CsvArtifact {
  return {
    id: "csv-artifact",
    kind: "csv",
    title: "export.csv",
    filename: "export.csv",
    content,
  };
}

afterEach(() => {
  cleanup();
});

describe("CsvRenderer", () => {
  it("renders a native table and reports readiness", () => {
    const onReady = vi.fn();

    render(<CsvRenderer artifact={createArtifact("name,status\nviewer,ready")} onReady={onReady} />);

    expect(screen.getByTestId("renderer-csv")).toHaveAttribute("data-renderer-ready", "true");
    expect(screen.getByRole("columnheader", { name: "name" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "viewer" })).toBeVisible();
    expect(onReady).toHaveBeenCalled();
  });

  it("does not report readiness again when only the callback identity changes", () => {
    const artifact = createArtifact("name,status\nviewer,ready");
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const { rerender } = render(<CsvRenderer artifact={artifact} onReady={firstReady} />);

    expect(firstReady).toHaveBeenCalledTimes(1);

    rerender(<CsvRenderer artifact={artifact} onReady={secondReady} />);

    expect(secondReady).not.toHaveBeenCalled();
  });

  it("keeps cells that are wider than the header row", () => {
    render(<CsvRenderer artifact={createArtifact("name\nviewer,ready,extra")} />);

    expect(screen.getByRole("columnheader", { name: "name" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "column_2" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "column_3" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "ready" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "extra" })).toBeVisible();
  });
});
