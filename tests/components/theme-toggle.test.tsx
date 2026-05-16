import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark,
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

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: originalMatchMedia,
  });
});

describe("ThemeToggle", () => {
  it("preserves the theme localStorage key and toggles the html dark class", async () => {
    window.localStorage.setItem("theme", "dark");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });

    const toggle = screen.getByRole("button", { name: /switch to light theme/i });
    await userEvent.click(toggle);

    expect(window.localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeVisible();
  });

  it("uses the system preference when no stored theme exists", async () => {
    mockMatchMedia(true);

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(screen.getByRole("button", { name: /switch to light theme/i })).toBeVisible();
  });
});
