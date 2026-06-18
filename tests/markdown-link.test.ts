import { describe, expect, it } from "vitest";
import { formatMarkdownLink } from "@/lib/markdown-link";

describe("formatMarkdownLink", () => {
  it("formats a standard inline link", () => {
    expect(formatMarkdownLink("Viewer bootstrap", "https://example.com/#agent-render=v1.plain.abc")).toBe(
      "[Viewer bootstrap](https://example.com/#agent-render=v1.plain.abc)",
    );
  });

  it("escapes brackets in the label", () => {
    expect(formatMarkdownLink("Sprint [draft]", "https://example.com/")).toBe(
      "[Sprint \\[draft\\]](https://example.com/)",
    );
  });

  it("falls back to the URL when the label is blank", () => {
    expect(formatMarkdownLink("   ", "https://example.com/")).toBe("[https://example.com/](https://example.com/)");
  });
});
