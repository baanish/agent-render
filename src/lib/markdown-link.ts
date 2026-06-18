/**
 * Escape characters that would break a markdown inline link label.
 */
function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Format a markdown inline link from a label and destination URL.
 */
export function formatMarkdownLink(label: string, href: string): string {
  const trimmedLabel = label.trim() || href;
  return `[${escapeMarkdownLinkLabel(trimmedLabel)}](${href})`;
}
