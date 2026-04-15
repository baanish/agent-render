"use client";

import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
const RAINBOW_BRACKET_LEVELS = 6;

/**
 * Builds the read-only CodeMirror theme. Passes `dark` so CodeMirror’s theme facet
 * matches the app (indentation markers and other plugins use it, not CSS alone).
 */
function createEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
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
        color: "var(--surface-code-gutter-fg)",
        borderRight: "1px solid var(--surface-code-gutter-border)",
        minWidth: "3.3rem",
      },
      ".cm-gutterElement": {
        padding: "0 0.9rem 0 0.7rem",
        textAlign: "right",
      },
      ".cm-activeLine": {
        backgroundColor: "var(--surface-code-active-line)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--surface-code-active-gutter)",
      },
      ".cm-selectionBackground": {
        backgroundColor: "var(--surface-code-selection-bg) !important",
      },
      ".cm-rainbow-bracket": {
        fontWeight: "700",
      },
      ...Object.fromEntries(
        Array.from({ length: RAINBOW_BRACKET_LEVELS }, (_, index) => [
          `.cm-rb-${index}`,
          {
            color: `var(--rb-${index}) !important`,
          },
        ]),
      ),
    },
    { dark: isDark },
  );
}

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
      const level = stack.length % RAINBOW_BRACKET_LEVELS;
      stack.push(level);
      builder.add(index, index + 1, Decoration.mark({ class: `cm-rainbow-bracket cm-rb-${level}` }));
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      const level = stack.length > 0 ? (stack.pop() ?? 0) : 0;
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
  const { resolvedTheme } = useTheme();
  /**
   * CodeMirror’s `dark` facet (syntax + indentation markers). When `resolvedTheme` is still
   * undefined, read `html.dark` so the first mount matches the class next-themes applies before
   * React state catches up.
   */
  const isCmDark = useMemo(() => {
    if (resolvedTheme === "dark") {
      return true;
    }
    if (resolvedTheme === "light") {
      return false;
    }
    return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  }, [resolvedTheme]);
  const editorTheme = useMemo(() => createEditorTheme(isCmDark), [isCmDark]);
  const language = useMemo(() => detectCodeLanguage(artifact.filename, artifact.language), [artifact.filename, artifact.language]);

  // Runs before paint so the first CodeMirror mount matches the viewport (call sites use dynamic(..., { ssr: false })).
  // Preference stays on wrapPreferenceRef (not state) so the matchMedia listener closure stays correct without
  // re-subscribing each render. compact=true resets to "auto"; compact is static at all call sites today.
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

    void loadLanguageSupport(language)
      .then((extension) => {
        if (!cancelled) {
          setLanguageExtension(extension);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLanguageExtension(null);
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
  }, [artifact.content, editorTheme, languageExtension, onReady, wrapLines]);

  return (
    <div
      className={compact ? "code-renderer-shell is-compact" : "code-renderer-shell"}
      data-testid="renderer-code"
      data-renderer-ready={isReady ? "true" : "false"}
    >
      {compact ? null : (
        <div className="code-renderer-toolbar">
          <div className="code-renderer-meta">
            <span className="mono-pill code-renderer-language-pill">{language}</span>
            <span className="section-kicker code-renderer-readonly-label">read-only codemirror</span>
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
