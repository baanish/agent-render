import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ViewerShell } from "@/components/viewer-shell";

describe("ViewerShell homepage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("shows zero-retention homepage copy and required links with no fragment", async () => {
    render(<ViewerShell />);

    await waitFor(() => expect(screen.getByTestId("viewer-shell")).toHaveAttribute("data-viewer-state", "empty"));

    expect(screen.getByRole("heading", { name: /zero-retention artifact viewer/i })).toBeVisible();
    expect(screen.getByText(/artifact content lives in the URL fragment/i)).toBeVisible();
    expect(screen.getByText(/the static host does not receive artifact content/i)).toBeVisible();
    expect(screen.getByText(/browser history, screenshots, copied messages, extensions/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /github/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /payload format docs/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /safety.*security page/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /openclaw/i })).toBeVisible();
  });
});
