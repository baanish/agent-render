import {
  buildMarkdownLinkShareInfo,
  formatMarkdownLink,
} from "../../src/lib/markdown-link";

export type OutputFormat = "url" | "markdown" | "discord" | "slack" | "plain";

export type FormattedOutput = {
  text: string;
  warning: string | null;
};

function escapeSlack(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "｜");
}

/** Formats one artifact URL for the requested chat or plain-text surface. */
export function formatArtifactOutput(
  format: OutputFormat,
  label: string,
  url: string,
  markdownUrl: string = url,
): FormattedOutput {
  if (format === "markdown") return { text: formatMarkdownLink(label, markdownUrl), warning: null };
  if (format === "discord") {
    const share = buildMarkdownLinkShareInfo(label, markdownUrl);
    return { text: share.markdownLink, warning: share.discordWarning };
  }
  if (format === "slack") return { text: `<${url}|${escapeSlack(label)}>`, warning: null };
  if (format === "plain") return { text: `${label}: ${url}`, warning: null };
  return { text: url, warning: null };
}
