"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { WrapText } from "lucide-react";
import { File as PierreFile, type FileOptions } from "@/lib/diff/pierre-react";
import { detectCodeLanguage, toPierreLanguage } from "@/lib/code/language";
import type { CodeArtifact } from "@/lib/payload/schema";

const MOBILE_CODE_MEDIA_QUERY = "(max-width: 640px)";

type WrapPreference = "auto" | "on" | "off";

type CodeRendererProps = {
  artifact: CodeArtifact;
  compact?: boolean;
  onReady?: () => void;
};

/**
 * Presents code artifacts in a read-only Pierre `File` surface for standalone and embedded
 * renderer flows. Accepts `artifact`, optional `compact` (markdown fences, JSON raw), and
 * `onReady` to notify parent renderers when the first render mounts. The wrap toggle maps to
 * Pierre's `overflow` option, so toggling re-renders in place instead of remounting.
 */
export function CodeRenderer({ artifact, compact = false, onReady }: CodeRendererProps) {
  const onReadyRef = useRef(onReady);
  const wrapPreferenceRef = useRef<WrapPreference>("auto");
  const [wrapLines, setWrapLines] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const language = useMemo(
    () => detectCodeLanguage(artifact.filename, artifact.language),
    [artifact.filename, artifact.language],
  );

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const file = useMemo(
    () => ({
      name: artifact.filename ?? `${artifact.id}.txt`,
      contents: artifact.content,
      lang: toPierreLanguage(language),
      // No cacheKey: Pierre treats matching cacheKeys as the same document without
      // comparing contents, so an in-place artifact swap (edit -> preview) would reuse
      // a stale line cache and crash with a line-count mismatch.
    }),
    [artifact.filename, artifact.id, artifact.content, language],
  );

  // The stage resets its ready flag when the artifact identity changes; File keeps the same
  // instance and emits "update" rather than "mount" on that path, so the flag must drop and
  // be re-raised by the next render. Render-time adjustment (not an effect) so it lands
  // before File's layout-effect re-render emits that "update".
  const previousFileRef = useRef(file);
  if (previousFileRef.current !== file) {
    previousFileRef.current = file;
    setIsReady(false);
  }

  // Runs before paint so the first mount matches the viewport (call sites use
  // dynamic(..., { ssr: false })). Compact blocks preserve source whitespace and scroll
  // horizontally.
  useLayoutEffect(() => {
    if (compact) {
      setWrapLines(false);
      wrapPreferenceRef.current = "off";
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

  const options = useMemo<FileOptions<undefined>>(
    () => ({
      theme: "agent-render",
      // The code surface is always the dark charcoal document, in both shell themes.
      themeType: "dark",
      overflow: wrapLines ? "wrap" : "scroll",
      disableFileHeader: compact,
      onPostRender: (_node, _instance, phase) => {
        // "mount" fires on first hydrate and "update" on every later render, including the
        // in-place artifact swap the stage waits on. "unmount" is the only non-ready phase.
        if (phase === "unmount") {
          return;
        }
        setIsReady(true);
        onReadyRef.current?.();
      },
    }),
    [wrapLines, compact],
  );

  return (
    <div
      className={compact ? "code-renderer-shell is-compact" : "code-renderer-shell"}
      data-testid="renderer-code"
      data-renderer-ready={isReady ? "true" : "false"}
    >
      {compact ? null : (
        <div className="code-renderer-toolbar">
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
      <div className="code-renderer-host">
        <PierreFile
          file={file}
          options={options}
          className="code-renderer-pierre"
          disableWorkerPool
        />
      </div>
    </div>
  );
}
