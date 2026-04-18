import { describe, expect, it } from "vitest";
import {
  estimateMarkdownTokens,
  htmlToMarkdown,
  responseWantsMarkdown,
} from "../../selfhosted/markdown-for-agents";

describe("responseWantsMarkdown", () => {
  it("returns false when Accept is missing", () => {
    expect(responseWantsMarkdown(undefined)).toBe(false);
  });

  it("returns true when text/markdown is listed without competing HTML", () => {
    expect(responseWantsMarkdown("text/markdown")).toBe(true);
  });

  it("returns false when HTML and markdown have equal q (prefer HTML)", () => {
    expect(responseWantsMarkdown("text/html, text/markdown")).toBe(false);
  });

  it("returns true when markdown has higher quality than HTML", () => {
    expect(responseWantsMarkdown("text/html;q=0.5, text/markdown;q=0.9")).toBe(true);
  });

  it("returns false for HTML-only Accept", () => {
    expect(responseWantsMarkdown("text/html, application/xhtml+xml")).toBe(false);
  });
});

describe("htmlToMarkdown", () => {
  it("converts a simple heading", () => {
    const md = htmlToMarkdown('<h1 id="x">Hello</h1>');
    expect(md).toContain("# Hello");
  });
});

describe("estimateMarkdownTokens", () => {
  it("returns a positive integer for non-empty markdown", () => {
    expect(estimateMarkdownTokens("abc")).toBeGreaterThan(0);
  });
});
