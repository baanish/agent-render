import type { SupportedLanguages } from "@pierre/diffs";
import { bundledLanguages } from "shiki";

/**
 * Options for the language pickers in the link creator and artifact editor.
 * `auto` stores an empty language hint so detection falls back to the filename.
 * Values are `detectCodeLanguage` keys; `toPierreLanguage` resolves them to
 * Shiki grammars and degrades unknown ones to `text`.
 */
export const CODE_LANGUAGE_CHOICES: readonly { value: string; label: string }[] = [
  { value: "", label: "auto" },
  { value: "tsx", label: "tsx" },
  { value: "ts", label: "ts" },
  { value: "jsx", label: "jsx" },
  { value: "js", label: "js" },
  { value: "python", label: "python" },
  { value: "json", label: "json" },
  { value: "html", label: "html" },
  { value: "css", label: "css" },
  { value: "markdown", label: "markdown" },
  { value: "yaml", label: "yaml" },
  { value: "shell", label: "shell" },
  { value: "rust", label: "rust" },
  { value: "go", label: "go" },
  { value: "java", label: "java" },
  { value: "c", label: "c" },
  { value: "cpp", label: "cpp" },
  { value: "sql", label: "sql" },
  { value: "text", label: "text" },
];

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
 * Maps a `detectCodeLanguage` key to the Shiki grammar id Pierre's `File`/`CodeView`
 * surfaces understand. `bundledLanguages` carries Shiki's alias keys too, so `ts`, `js`,
 * `py`, `yml`, `shell`, and friends resolve. Anything outside the registry (for example a
 * codec name like `plain` leaking into `language`) falls back to `text`, because Pierre's
 * `resolveLanguage` throws on unknown ids instead of degrading.
 */
export function toPierreLanguage(language: string): SupportedLanguages {
  if (language === "text" || language === "ansi") {
    return language;
  }
  return Object.prototype.hasOwnProperty.call(bundledLanguages, language)
    ? (language as SupportedLanguages)
    : "text";
}
