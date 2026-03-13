import type { Extension } from "@codemirror/state";

/**
 * Determines the code language token used by the viewer.
 *
 * Explicit language wins first (trimmed and lowercased); when absent, language is inferred from
 * the filename extension, and defaults to `text` when no mapping matches.
 *
 * @param filename - Optional source filename used for extension-based inference.
 * @param explicit - Optional user-provided language override.
 * @returns A normalized language key for syntax selection.
 *
 * Failure/fallback: unknown or missing inputs fall back to `text`.
 */
export function detectCodeLanguage(filename?: string, explicit?: string) {
  const normalized = explicit?.trim().toLowerCase();
  if (normalized) {
    return normalized;
  }

  const lower = filename?.toLowerCase() ?? "";

  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return "ts";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "js";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "shell";

  return "text";
}

/**
 * Lazily loads CodeMirror language support for a normalized language key.
 *
 * Returns an extension for supported languages and aliases (for example `js`/`javascript`,
 * `python`/`py`, `yaml`/`yml`) using dynamic imports to keep base bundles small.
 *
 * @param language - Normalized language token from detection or artifact metadata.
 * @returns A CodeMirror extension for supported languages, or `null` when unsupported.
 *
 * Failure/fallback: unsupported language keys return `null` so callers can render plain text.
 */
export async function loadLanguageSupport(language: string): Promise<Extension | null> {
  switch (language) {
    case "tsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: true, typescript: true });
    }
    case "ts": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ typescript: true });
    }
    case "jsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ jsx: true });
    }
    case "js":
    case "javascript": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript();
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }
    case "css": {
      const { css } = await import("@codemirror/lang-css");
      return css();
    }
    case "html": {
      const { html } = await import("@codemirror/lang-html");
      return html();
    }
    case "python":
    case "py": {
      const { python } = await import("@codemirror/lang-python");
      return python();
    }
    case "markdown": {
      const { markdown } = await import("@codemirror/lang-markdown");
      return markdown();
    }
    case "yaml":
    case "yml": {
      const { yaml } = await import("@codemirror/lang-yaml");
      return yaml();
    }
    default:
      return null;
  }
}
