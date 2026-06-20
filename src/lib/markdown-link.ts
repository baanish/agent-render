import { numberFormatter } from "@/lib/format";

/** Discord's per-message character limit. */
export const DISCORD_MESSAGE_MAX_LENGTH = 2000;

/**
 * Escape characters that would break a markdown inline link label.
 */
function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Format a markdown link destination, wrapping URLs that contain characters
 * which would prematurely terminate a parenthesized destination (e.g. `)`).
 */
function formatMarkdownDestination(href: string): string {
  if (!/[()\s]/.test(href)) {
    return href;
  }

  const safeHref = href.replace(/</g, "%3C").replace(/>/g, "%3E");
  return `<${safeHref}>`;
}

/**
 * Format a markdown inline link from a label and destination URL.
 */
export function formatMarkdownLink(label: string, href: string): string {
  const trimmedLabel = label.trim() || href;
  return `[${escapeMarkdownLinkLabel(trimmedLabel)}](${formatMarkdownDestination(href)})`;
}

export type MarkdownLinkShareInfo = {
  markdownLink: string;
  length: number;
  discordWarning: string | null;
};

/**
 * Returns whether a formatted markdown link exceeds Discord's message limit.
 */
export function isDiscordMarkdownLinkTooLong(markdownLink: string): boolean {
  return markdownLink.length > DISCORD_MESSAGE_MAX_LENGTH;
}

/**
 * Builds an agent-facing Discord warning when a markdown link is too long for a single message.
 */
export function getDiscordMarkdownLinkWarning(markdownLink: string): string | null {
  if (!isDiscordMarkdownLinkTooLong(markdownLink)) {
    return null;
  }

  const formattedLength = numberFormatter.format(markdownLink.length);
  const limit = numberFormatter.format(DISCORD_MESSAGE_MAX_LENGTH);

  return `This markdown link is ${formattedLength} characters, which exceeds Discord's ${limit} character message limit. Split the bundle into smaller artifacts and send separate markdown links in multiple Discord messages.`;
}

/**
 * Builds a viewer-facing notice when a markdown link may be too long to post in Discord.
 */
export function getDiscordMarkdownLinkViewerNotice(markdownLink: string): string | null {
  if (!isDiscordMarkdownLinkTooLong(markdownLink)) {
    return null;
  }

  const formattedLength = numberFormatter.format(markdownLink.length);
  const limit = numberFormatter.format(DISCORD_MESSAGE_MAX_LENGTH);

  return `This markdown link is ${formattedLength} characters, which may be too long to post directly in Discord's ${limit} character message limit.`;
}

/**
 * Formats a markdown link and returns share metadata, including a Discord warning when needed.
 */
export function buildMarkdownLinkShareInfo(label: string, href: string): MarkdownLinkShareInfo {
  const markdownLink = formatMarkdownLink(label, href);

  return {
    markdownLink,
    length: markdownLink.length,
    discordWarning: getDiscordMarkdownLinkWarning(markdownLink),
  };
}
