import TurndownService from "turndown";

/**
 * Markdown for Agents–style negotiation and HTML→markdown conversion for static
 * preview and self-hosted servers. Mirrors the behavior described at
 * https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 * for origins that are not behind Cloudflare’s edge converter.
 */

/** Cloudflare documents a 2 MB origin response limit for markdown conversion. */
export const MARKDOWN_MAX_HTML_BYTES = 2_097_152;

/**
 * Parse `Accept` and return whether the client prefers `text/markdown` over
 * `text/html` / XHTML for this response. Ties favor HTML (browser default).
 */
export function responseWantsMarkdown(acceptHeader: string | undefined): boolean {
  if (!acceptHeader) {
    return false;
  }

  let htmlQ = 0;
  let markdownQ = 0;

  for (const segment of acceptHeader.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(";").map((p) => p.trim());
    const typePart = (parts[0] || "").toLowerCase();
    let q = 1;

    for (let i = 1; i < parts.length; i++) {
      const param = parts[i];
      const eq = param.indexOf("=");
      if (eq === -1) continue;
      const key = param.slice(0, eq).trim().toLowerCase();
      const value = param.slice(eq + 1).trim();
      if (key === "q") {
        const parsed = Number.parseFloat(value);
        if (!Number.isNaN(parsed)) q = parsed;
      }
    }

    if (typePart === "text/html" || typePart === "application/xhtml+xml") {
      htmlQ = Math.max(htmlQ, q);
    } else if (typePart === "text/markdown") {
      markdownQ = Math.max(markdownQ, q);
    }
  }

  if (markdownQ === 0) {
    return false;
  }

  return markdownQ > htmlQ;
}

/**
 * Rough token estimate for `x-markdown-tokens` (character-length heuristic).
 */
export function estimateMarkdownTokens(markdown: string): number {
  if (!markdown) return 0;
  return Math.max(1, Math.ceil(markdown.length / 4));
}

/**
 * Convert HTML body to Markdown (Turndown).
 */
export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "_",
  });

  return `${td.turndown(html).trimEnd()}\n`;
}

/**
 * Headers for a successful markdown response (plus caller-supplied length).
 */
export function markdownResponseHeaders(tokenEstimate: number): Record<string, string> {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept",
    "x-markdown-tokens": String(tokenEstimate),
  };
}
