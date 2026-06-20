import { describe, expect, it } from "vitest";
import {
  buildMarkdownLinkShareInfo,
  DISCORD_MESSAGE_MAX_LENGTH,
  formatMarkdownLink,
  getDiscordMarkdownLinkWarning,
  getDiscordMarkdownLinkViewerNotice,
  isDiscordMarkdownLinkTooLong,
} from "@/lib/markdown-link";

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

  it("wraps destinations containing closing parentheses in angle brackets", () => {
    const href = "https://example.com/#agent-render=v1.arx.1.payload)more";
    expect(formatMarkdownLink("Arx sample", href)).toBe(`[Arx sample](<${href}>)`);
  });

  it("percent-encodes angle brackets inside wrapped destinations", () => {
    const href = "https://example.com/path?x=a)b>c";
    expect(formatMarkdownLink("Wrapped", href)).toBe("[Wrapped](<https://example.com/path?x=a)b%3Ec>)");
  });

  it("flags markdown links that exceed Discord's message limit", () => {
    const href = `https://example.com/#${"a".repeat(DISCORD_MESSAGE_MAX_LENGTH)}`;
    const markdownLink = formatMarkdownLink("Report", href);

    expect(isDiscordMarkdownLinkTooLong(markdownLink)).toBe(true);
    expect(getDiscordMarkdownLinkWarning(markdownLink)).toMatch(/Discord's 2,000 character message limit/i);
    expect(getDiscordMarkdownLinkWarning(markdownLink)).toMatch(/Split the bundle into smaller artifacts/i);
  });

  it("returns no Discord warning for links within the limit", () => {
    const shareInfo = buildMarkdownLinkShareInfo("Weekly report", "https://agent-render.com/#pabc");

    expect(shareInfo.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX_LENGTH);
    expect(shareInfo.discordWarning).toBeNull();
    expect(shareInfo.markdownLink).toBe("[Weekly report](https://agent-render.com/#pabc)");
  });

  it("uses viewer-facing notice copy without split guidance", () => {
    const href = `https://example.com/#${"a".repeat(DISCORD_MESSAGE_MAX_LENGTH)}`;
    const markdownLink = formatMarkdownLink("Report", href);
    const notice = getDiscordMarkdownLinkViewerNotice(markdownLink);

    expect(notice).toMatch(/may be too long to post directly in Discord/i);
    expect(notice).not.toMatch(/Split the bundle/i);
  });
});
