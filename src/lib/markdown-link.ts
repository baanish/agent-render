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
