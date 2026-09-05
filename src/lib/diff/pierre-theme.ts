"use client";

import { registerCustomCSSVariableTheme } from "@pierre/diffs";

// Shiki theme driven by --diffs-token-* custom properties, which inherit
// through the shadow boundary from .diff-renderer-frame (globals.css) and tie
// diff syntax to the app's own rainbow palette instead of a foreign theme.
// The values here are baked-in fallbacks for contexts without the app CSS.
registerCustomCSSVariableTheme("agent-render", {
  foreground: "#e6dfcf",
  background: "#1c1915",
  "token-keyword": "#f08d5e",
  "token-function": "#9eb3ff",
  "token-string": "#80c193",
  "token-string-expression": "#80c193",
  "token-constant": "#efb360",
  "token-parameter": "#69d1dd",
  "token-link": "#69d1dd",
  "token-comment": "#8b8271",
  "token-punctuation": "#b0a794",
  "token-inserted": "#9ccfae",
  "token-deleted": "#d96a5c",
  "token-changed": "#efb360",
});
