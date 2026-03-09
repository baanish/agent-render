import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";

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

export function getLanguageSupport(language: string) {
  switch (language) {
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "ts":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "js":
    case "javascript":
    case "shell":
      return javascript();
    case "json":
      return json();
    case "css":
      return css();
    case "html":
      return html();
    case "python":
    case "py":
      return python();
    case "markdown":
      return markdown();
    case "yaml":
    case "yml":
      return yaml();
    default:
      return null;
  }
}
