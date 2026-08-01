import { describe, expect, it } from "vitest";
import { DISCORD_MESSAGE_MAX_LENGTH } from "../../src/lib/markdown-link";
import { formatArtifactOutput } from "../src/format";

describe("formatArtifactOutput", () => {
  it("formats markdown, Slack, plain text, and bare URLs", () => {
    const url = "https://agent-render.com/#payload";
    expect(formatArtifactOutput("url", "Report", url).text).toBe(url);
    expect(formatArtifactOutput("markdown", "Report", url).text).toBe(`[Report](${url})`);
    expect(formatArtifactOutput("slack", "A | B", url).text).toBe(`<${url}|A ｜ B>`);
    expect(formatArtifactOutput("plain", "Report", url).text).toBe(`Report: ${url}`);
  });

  it("uses the existing Discord warning contract", () => {
    const oversizedUrl = `https://agent-render.com/#${"x".repeat(DISCORD_MESSAGE_MAX_LENGTH)}`;
    const result = formatArtifactOutput("discord", "Report", oversizedUrl);
    expect(result.text).toBe(`[Report](${oversizedUrl})`);
    expect(result.warning).toContain("exceeds Discord");
  });
});
