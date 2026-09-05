import type { SupportedLanguages } from "@pierre/diffs";
import { bundledLanguages } from "shiki";

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
