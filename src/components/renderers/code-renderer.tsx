"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WrapText } from "lucide-react";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import type { CodeArtifact } from "@/lib/payload/schema";

type CodeRendererProps = {
  artifact: CodeArtifact;
};

const rainbowColors = ["#f08d5e", "#efb360", "#69d1dd", "#80c193", "#9eb3ff", "#d799ff"];
const indentGuideColors = [
  "rgba(240, 141, 94, 0.28)",
  "rgba(239, 179, 96, 0.28)",
  "rgba(105, 209, 221, 0.28)",
  "rgba(128, 193, 147, 0.28)",
  "rgba(158, 179, 255, 0.28)",
  "rgba(215, 153, 255, 0.28)",
];

function detectLanguage(artifact: CodeArtifact) {
  const explicit = artifact.language?.trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  const filename = artifact.filename?.toLowerCase() ?? "";

  if (filename.endsWith(".tsx")) return "tsx";
  if (filename.endsWith(".jsx")) return "jsx";
  if (filename.endsWith(".ts") || filename.endsWith(".mts") || filename.endsWith(".cts")) return "ts";
  if (filename.endsWith(".js") || filename.endsWith(".mjs") || filename.endsWith(".cjs")) return "js";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".css")) return "css";
  if (filename.endsWith(".html") || filename.endsWith(".htm")) return "html";
  if (filename.endsWith(".py")) return "python";

  return "text";
}

function languageSupport(language: string) {
  switch (language) {
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "ts":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "js":
    case "javascript":
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
    default:
      return null;
  }
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--surface-code-text)",
    backgroundColor: "var(--surface-code)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.65",
  },
  ".cm-content": {
    padding: "0.9rem 0 1.1rem 0",
    caretColor: "var(--surface-code-text)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-code-raised)",
    color: "rgba(239, 243, 247, 0.5)",
    borderRight: "1px solid rgba(239, 243, 247, 0.08)",
    minWidth: "3.3rem",
  },
  ".cm-gutterElement": {
    padding: "0 0.9rem 0 0.7rem",
    textAlign: "right",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.045)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgba(105, 209, 221, 0.18) !important",
  },
  ".cm-indent-guide": {
    boxSizing: "border-box",
    borderLeft: "2px solid transparent",
  },
  ".cm-rainbow-bracket": {
    fontWeight: "700",
  },
  ...Object.fromEntries(
    indentGuideColors.map((color, index) => [
      `.cm-content .cm-ig-${index}`,
      { borderLeft: `2px solid ${color} !important` },
    ]),
  ),
});

const rainbowDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state.doc.toString());
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.state.doc.toString());
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

function buildDecorations(text: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: { from: number; to: number; decoration: Decoration }[] = [];

  let inString = false;
  let stringChar = "";
  let escaped = false;
  const stack: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if ((char === '"' || char === "'" || char === "`") && !escaped) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
        stringChar = "";
      }
      escaped = false;
      continue;
    }

    if (char === "\\" && !escaped) {
      escaped = true;
      continue;
    }

    if (inString) {
      escaped = false;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      const level = stack.length % rainbowColors.length;
      stack.push(level);
      ranges.push({
        from: index,
        to: index + 1,
        decoration: Decoration.mark({
          class: "cm-rainbow-bracket",
          attributes: { style: `color: ${rainbowColors[level]} !important` },
        }),
      });
      escaped = false;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      const level = stack.length > 0 ? stack.pop() ?? 0 : 0;
      ranges.push({
        from: index,
        to: index + 1,
        decoration: Decoration.mark({
          class: "cm-rainbow-bracket",
          attributes: { style: `color: ${rainbowColors[level]} !important` },
        }),
      });
    }

    escaped = false;
  }

  let lineStart = 0;
  while (lineStart <= text.length) {
    const lineEnd = text.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const lineText = text.slice(lineStart, end);

    let leading = 0;
    for (let index = 0; index < lineText.length; index += 1) {
      const char = lineText[index];
      if (char === " ") {
        leading += 1;
        continue;
      }
      if (char === "\t") {
        leading += 2;
        continue;
      }
      break;
    }

    const levelCount = Math.floor(leading / 2);
    for (let level = 0; level < levelCount; level += 1) {
      const target = lineStart + Math.min(level * 2, Math.max(0, lineText.length - 1));
      if (target < end) {
        ranges.push({
          from: target,
          to: target + 1,
          decoration: Decoration.mark({ class: `cm-indent-guide cm-ig-${level % indentGuideColors.length}` }),
        });
      }
    }

    if (lineEnd === -1) {
      break;
    }
    lineStart = lineEnd + 1;
  }

  ranges.sort((left, right) => (left.from === right.from ? left.to - right.to : left.from - right.from));
  for (const range of ranges) {
    builder.add(range.from, range.to, range.decoration);
  }

  return builder.finish();
}

export function CodeRenderer({ artifact }: CodeRendererProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const language = useMemo(() => detectLanguage(artifact), [artifact]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    hostRef.current.replaceChildren();

    const extensions = [
      lineNumbers(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...searchKeymap]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      indentUnit.of("  "),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      editorTheme,
      rainbowDecorations,
    ];

    if (wrapLines) {
      extensions.push(EditorView.lineWrapping);
    }

    const support = languageSupport(language);
    if (support) {
      extensions.push(support);
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: artifact.content,
        extensions,
      }),
      parent: hostRef.current,
    });

    return () => {
      view.destroy();
    };
  }, [artifact.content, language, wrapLines]);

  return (
    <div className="code-renderer-shell">
      <div className="code-renderer-toolbar">
        <div className="code-renderer-meta">
          <span className="mono-pill !border-[rgba(239,243,247,0.12)] !bg-[rgba(255,255,255,0.04)] !text-[rgba(239,243,247,0.86)]">
            {language}
          </span>
          <span className="section-kicker !text-[rgba(239,243,247,0.56)]">read-only codemirror</span>
        </div>
        <button type="button" className="artifact-action is-code" onClick={() => setWrapLines((value) => !value)}>
          <WrapText className="h-3.5 w-3.5" />
          {wrapLines ? "Disable wrap" : "Enable wrap"}
        </button>
      </div>
      <div ref={hostRef} className="code-renderer-host" />
    </div>
  );
}
