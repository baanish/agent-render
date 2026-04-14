"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WrapText } from "lucide-react";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
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
import { bracketMatching, defaultHighlightStyle, syntaxTree, syntaxHighlighting } from "@codemirror/language";
import { detectCodeLanguage, loadLanguageSupport } from "@/lib/code/language";
import type { CodeArtifact } from "@/lib/payload/schema";

const MOBILE_CODE_MEDIA_QUERY = "(max-width: 640px)";

type WrapPreference = "auto" | "on" | "off";

type CodeRendererProps = {
  artifact: CodeArtifact;
  compact?: boolean;
  onReady?: () => void;
};

const MAX_DECORATED_CONTENT_LENGTH = 120000;
const rainbowColors = ["#f08d5e", "#efb360", "#69d1dd", "#80c193", "#9eb3ff", "#d799ff"];

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
  ".cm-rainbow-bracket": {
    fontWeight: "700",
  },
  ...Object.fromEntries(
    rainbowColors.map((color, index) => [
      `.cm-rb-${index}`,
      {
        color: `${color} !important`,
      },
    ]),
  ),
});

function buildIgnoredRanges(state: EditorState) {
  const ignored: Array<{ from: number; to: number }> = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (/(Comment|String|Template|RegExp)/i.test(node.name)) {
        ignored.push({ from: node.from, to: node.to });
      }
    },
  });

  return ignored.sort((left, right) => left.from - right.from);
}

function buildRainbowDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();
  const ignored = buildIgnoredRanges(state);

  let ignoredIndex = 0;
  const stack: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    while (ignoredIndex < ignored.length && index >= ignored[ignoredIndex]!.to) {
      ignoredIndex += 1;
    }

    const currentIgnored = ignored[ignoredIndex];
    if (currentIgnored && index >= currentIgnored.from && index < currentIgnored.to) {
      continue;
    }

    const char = text[index];
    if (char === "{" || char === "[" || char === "(") {
      const level = stack.length % rainbowColors.length;
      stack.push(level);
      builder.add(index, index + 1, Decoration.mark({ class: `cm-rainbow-bracket cm-rb-${level}` }));
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      const level = stack.length > 0 ? stack.pop() ?? 0 : 0;
      builder.add(index, index + 1, Decoration.mark({ class: `cm-rainbow-bracket cm-rb-${level}` }));
    }
  }

  return builder.finish();
}

const rainbowBrackets = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildRainbowDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildRainbowDecorations(update.state);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  },
);

/**
 * Presents code artifacts in a read-only CodeMirror surface for standalone and embedded renderer flows.
 * Accepts `artifact`, optional `compact`, and `onReady` to notify parent renderers when mount is complete.
 * Lazily loads language support, offers optional line wrapping, and falls back to baseline highlighting when needed.
 */
export function CodeRenderer({ artifact, compact = false, onReady }: CodeRendererProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wrapPreferenceRef = useRef<WrapPreference>("auto");
  const [wrapLines, setWrapLines] = useState(compact);
  const [languageExtension, setLanguageExtension] = useState<Awaited<ReturnType<typeof loadLanguageSupport>>>(null);
  const [isReady, setIsReady] = useState(false);
  const language = useMemo(() => detectCodeLanguage(artifact.filename, artifact.language), [artifact.filename, artifact.language]);

  // Runs before paint so the first CodeMirror mount matches the viewport (call sites use dynamic(..., { ssr: false })).
  useLayoutEffect(() => {
    if (compact) {
      setWrapLines(true);
      wrapPreferenceRef.current = "auto";
      return;
    }

    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_CODE_MEDIA_QUERY);

    const applyWrapFromPreference = () => {
      const preference = wrapPreferenceRef.current;
      if (preference === "on") {
        setWrapLines(true);
        return;
      }
      if (preference === "off") {
        setWrapLines(false);
        return;
      }
      setWrapLines(mediaQuery.matches);
    };

    applyWrapFromPreference();

    const handleChange = () => {
      applyWrapFromPreference();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [compact]);

  useEffect(() => {
    let cancelled = false;

    void loadLanguageSupport(language).then((extension) => {
      if (!cancelled) {
        setLanguageExtension(extension);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    setIsReady(false);
    hostRef.current.replaceChildren();

    const extensions = [
      lineNumbers(),
      drawSelection(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...searchKeymap]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      indentationMarkers({
        markerType: "codeOnly",
        thickness: 2,
        hideFirstIndent: true,
        highlightActiveBlock: false,
        colors: {
          light: "rgba(70, 92, 129, 0.14)",
          dark: "rgba(239, 243, 247, 0.08)",
          activeLight: "rgba(105, 209, 221, 0.18)",
          activeDark: "rgba(105, 209, 221, 0.22)",
        },
      }),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      editorTheme,
    ];

    if (wrapLines) {
      extensions.push(EditorView.lineWrapping);
    }

    if (languageExtension) {
      extensions.push(languageExtension);
    }

    if (artifact.content.length <= MAX_DECORATED_CONTENT_LENGTH) {
      extensions.push(rainbowBrackets);
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: artifact.content,
        extensions,
      }),
      parent: hostRef.current,
    });

    let cancelled = false;
    const animationFrame = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setIsReady(true);
        onReady?.();
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      view.destroy();
    };
  }, [artifact.content, languageExtension, onReady, wrapLines]);

  return (
    <div
      className={compact ? "code-renderer-shell is-compact" : "code-renderer-shell"}
      data-testid="renderer-code"
      data-renderer-ready={isReady ? "true" : "false"}
    >
      {compact ? null : (
        <div className="code-renderer-toolbar">
          <div className="code-renderer-meta">
            <span className="mono-pill !border-[rgba(239,243,247,0.12)] !bg-[rgba(255,255,255,0.04)] !text-[rgba(239,243,247,0.86)]">
              {language}
            </span>
            <span className="section-kicker !text-[rgba(239,243,247,0.56)]">read-only codemirror</span>
          </div>
          <button
            type="button"
            className="artifact-action is-code"
            onClick={() => {
              const next = !wrapLines;
              wrapPreferenceRef.current = next ? "on" : "off";
              setWrapLines(next);
            }}
          >
            <WrapText className="h-3.5 w-3.5" />
            {wrapLines ? "Disable wrap" : "Enable wrap"}
          </button>
        </div>
      )}
      <div ref={hostRef} className="code-renderer-host" />
    </div>
  );
}
