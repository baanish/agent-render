"use client";

import dynamic from "next/dynamic";
import { Component, type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Columns2, Copy, Rows3 } from "lucide-react";
import { FileDiff, MultiFileDiff, setLanguageOverride, type FileDiffProps } from "@/lib/diff/pierre-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { detectCodeLanguage, toPierreLanguage } from "@/lib/code/language";
import { getContentKey } from "@/lib/content-key";
import { useResolvedTheme } from "@/components/theme/use-theme-controller";
import { getPatchFileLabels, parseRenderablePatchFiles, type ParsedPatchFile } from "@/lib/diff/git-patch";
import type { DiffArtifact } from "@/lib/payload/schema";

// The Trees runtime only mounts for multi-file patches, so it loads behind its own
// boundary rather than inflating every diff render.
const FileTreeNav = dynamic(
  () => import("@/components/file-tree-nav").then((module) => module.FileTreeNav),
  { ssr: false },
);

type DiffRendererProps = {
  artifact: DiffArtifact;
  onReady?: () => void;
};

const NARROW_DIFF_BREAKPOINT = 640;
const MOBILE_DIFF_MEDIA_QUERY = `(max-width: ${NARROW_DIFF_BREAKPOINT}px)`;

type DiffViewMode = "unified" | "split";
type DiffOptions = NonNullable<FileDiffProps<undefined>["options"]>;

type DiffRenderState =
  | {
      kind: "rich-patch";
      patchFiles: ParsedPatchFile[];
    }
  | {
      kind: "rich-contents";
      fileName: string;
      language: string | undefined;
    }
  | {
      kind: "fallback";
      message: string;
      detail?: string;
    };

type DiffRendererBoundaryProps = {
  artifact: DiffArtifact;
  onReady?: () => void;
  children: ReactNode;
};

type DiffRendererBoundaryState = {
  error: Error | null;
};

function getIsNarrowScreen() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_DIFF_MEDIA_QUERY).matches;
}

function getDefaultMode(view: DiffArtifact["view"], isNarrowScreen: boolean) {
  return view === "split" && !isNarrowScreen ? "split" : "unified";
}

// The Shiki theme is the same CSS-variable theme in both app modes; colors come
// from the --diffs-* custom properties in globals.css, which pierce the shadow
// DOM and flip under .dark. themeType only sets Pierre's light/dark semantics.
function getDiffOptions(mode: DiffViewMode, themeType: "light" | "dark"): DiffOptions {
  return {
    diffStyle: mode,
    theme: "agent-render",
    themeType,
    overflow: "wrap",
    disableFileHeader: true,
    diffIndicators: "classic",
  };
}

function getRawPatch(artifact: DiffArtifact) {
  return artifact.patch ?? "";
}

function getFallbackState(message: string, error?: unknown): DiffRenderState {
  const detail = error instanceof Error ? error.message : undefined;

  return {
    kind: "fallback",
    message,
    detail,
  };
}

const diffFallbackFrameStyle = {
  overflow: "auto",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  background: "color-mix(in srgb, var(--surface-strong) 94%, transparent)",
} satisfies CSSProperties;

const diffFallbackPreStyle = {
  margin: 0,
  padding: "1rem 1.1rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.85rem",
  lineHeight: 1.65,
  color: "var(--text-primary)",
} satisfies CSSProperties;

const diffFallbackDetailStyle = {
  marginTop: "0.55rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.76rem",
} satisfies CSSProperties;

class DiffRendererBoundary extends Component<DiffRendererBoundaryProps, DiffRendererBoundaryState> {
  state: DiffRendererBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): DiffRendererBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <DiffFallback
          artifact={this.props.artifact}
          message="This patch could not be rendered as a valid unified diff. Showing the raw patch instead."
          detail={this.state.error.message}
          onReady={this.props.onReady}
        />
      );
    }

    return this.props.children;
  }
}

function DiffFallback({
  artifact,
  message,
  detail,
  onReady,
}: {
  artifact: DiffArtifact;
  message: string;
  detail?: string;
  onReady?: () => void;
}) {
  const rawPatch = getRawPatch(artifact);
  const onReadyRef = useRef(onReady);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [artifact.id, rawPatch]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current?.();
  }, [artifact.id, rawPatch]);

  const handleCopyRawDiff = async () => {
    if (!rawPatch) {
      setCopyState("failed");
      return;
    }

    try {
      await copyTextToClipboard(rawPatch);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div
      className="diff-renderer-shell"
      data-testid="renderer-diff"
      data-renderer-ready="true"
      data-diff-state="fallback"
      data-diff-mode="raw"
      data-diff-controls="fallback"
      data-mobile-layout={getIsNarrowScreen() ? "true" : "false"}
    >
      <div className="diff-renderer-toolbar">
        {rawPatch ? (
          <button type="button" className={`artifact-action ${copyState === "copied" ? "is-confirmed" : ""}`} onClick={handleCopyRawDiff}>
            {copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copyState === "copied" ? "Copied raw diff" : "Copy raw diff"}
          </button>
        ) : null}
      </div>
      <div className="artifact-empty-state" role="status">
        <p>{message}</p>
        {detail ? <p style={diffFallbackDetailStyle}>Parser detail: {detail}</p> : null}
      </div>
      <div style={diffFallbackFrameStyle}>
        {rawPatch ? (
          <pre data-testid="renderer-diff-fallback-raw" style={diffFallbackPreStyle}>
            {rawPatch}
          </pre>
        ) : (
          <div className="artifact-empty-state">Raw diff data is unavailable for this artifact.</div>
        )}
      </div>
    </div>
  );
}

function DiffRendererContent({ artifact, onReady }: DiffRendererProps) {
  const resolvedTheme = useResolvedTheme();
  const onReadyRef = useRef(onReady);
  const readyFiredRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(getIsNarrowScreen);
  const [mode, setMode] = useState<DiffViewMode>(() => getDefaultMode(artifact.view, getIsNarrowScreen()));

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const reportReady = useCallback(() => {
    if (readyFiredRef.current) {
      return;
    }
    readyFiredRef.current = true;
    setIsReady(true);
    onReadyRef.current?.();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_DIFF_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsNarrowScreen(event.matches);
    };

    setIsNarrowScreen(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const renderedDiff = useMemo<DiffRenderState>(() => {
    if (artifact.patch) {
      try {
        const patchFiles = parseRenderablePatchFiles(artifact.patch);
        if (patchFiles.length === 0) {
          return getFallbackState(
            "This patch is not a valid unified diff, so the raw patch is shown instead.",
          );
        }
        const hint = artifact.language?.trim().toLowerCase();
        if (hint) {
          const lang = toPierreLanguage(hint);
          for (const file of patchFiles) {
            if (file.meta) {
              file.meta = setLanguageOverride(file.meta, lang);
            }
          }
        }
        return { kind: "rich-patch", patchFiles };
      } catch (error) {
        return getFallbackState(
          "This patch could not be rendered as a valid unified diff. Showing the raw patch instead.",
          error,
        );
      }
    }

    if (artifact.oldContent !== undefined && artifact.newContent !== undefined) {
      const fileName = artifact.filename ?? artifact.id;
      return {
        kind: "rich-contents",
        fileName,
        language: toPierreLanguage(detectCodeLanguage(fileName, artifact.language)),
      };
    }

    return getFallbackState(
      "This diff artifact does not include a valid patch payload to render.",
    );
  }, [artifact]);

  const patchFileTree = useMemo(() => {
    if (renderedDiff.kind !== "rich-patch" || renderedDiff.patchFiles.length <= 1) {
      return null;
    }

    const labels = getPatchFileLabels(renderedDiff.patchFiles);
    const fileIdByPath = new Map<string, string>();
    const paths: string[] = [];
    for (const file of renderedDiff.patchFiles) {
      const label = labels.get(file.id) ?? file.displayPath;
      fileIdByPath.set(label, file.id);
      paths.push(label);
    }
    const selectedId =
      renderedDiff.patchFiles.find((file) => file.id === activeFileId)?.id ??
      renderedDiff.patchFiles[0]?.id;
    const selectedPath = selectedId ? labels.get(selectedId) : undefined;

    return { fileIdByPath, paths, selectedPath };
  }, [renderedDiff, activeFileId]);

  const diffOptions = useMemo<DiffOptions>(
    () => ({
      ...getDiffOptions(mode, resolvedTheme),
      onPostRender: (_node, _instance, phase) => {
        if (phase !== "unmount") {
          reportReady();
        }
      },
    }),
    [mode, resolvedTheme, reportReady],
  );

  useEffect(() => {
    if (
      renderedDiff.kind === "rich-patch" &&
      renderedDiff.patchFiles.every((file) => file.isBinary)
    ) {
      reportReady();
    }
  }, [renderedDiff, reportReady]);

  if (renderedDiff.kind === "fallback") {
    return <DiffFallback artifact={artifact} message={renderedDiff.message} detail={renderedDiff.detail} onReady={onReady} />;
  }

  const handleFileSelect = (fileId: string) => {
    setActiveFileId(fileId);
    const section = document.getElementById(`patch-file-${fileId}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="diff-renderer-shell"
      data-testid="renderer-diff"
      data-renderer-ready={isReady ? "true" : "false"}
      data-diff-state="rich"
      data-diff-mode={mode}
      data-diff-controls={isNarrowScreen ? "gated" : "full"}
      data-mobile-layout={isNarrowScreen ? "true" : "false"}
    >
      <div className="diff-renderer-toolbar">
        {isNarrowScreen ? (
          <div className="diff-view-toggle" role="group" aria-label="Diff view mode">
            <button
              type="button"
              className={`artifact-action ${mode === "split" ? "is-depressed" : ""}`}
              onClick={() => setMode(mode === "split" ? "unified" : "split")}
              aria-pressed={mode === "split"}
            >
              {mode === "split" ? <Rows3 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
              {mode === "split" ? "Back to unified" : "Open split columns"}
            </button>
          </div>
        ) : (
          <div className="diff-view-toggle" role="group" aria-label="Diff view mode">
            <button
              type="button"
              className={`artifact-action ${mode === "unified" ? "is-depressed" : ""}`}
              onClick={() => setMode("unified")}
              aria-pressed={mode === "unified"}
            >
              <Rows3 className="h-3.5 w-3.5" />
              Unified
            </button>
            <button
              type="button"
              className={`artifact-action ${mode === "split" ? "is-depressed" : ""}`}
              onClick={() => setMode("split")}
              aria-pressed={mode === "split"}
            >
              <Columns2 className="h-3.5 w-3.5" />
              Split
            </button>
          </div>
        )}
      </div>
      <div className="diff-renderer-frame">
        {renderedDiff.kind === "rich-contents" ? (
          <div className="patch-bundle-shell is-single-file">
            <div className="patch-bundle-files">
              <section id={`patch-file-${artifact.id}`} className="patch-file-section">
                <header className="patch-file-header">
                  <div>
                    <p className="section-kicker">modified</p>
                    <h4>{renderedDiff.fileName}</h4>
                  </div>
                </header>
                <MultiFileDiff
                  oldFile={{ name: renderedDiff.fileName, contents: artifact.oldContent ?? "", lang: renderedDiff.language }}
                  newFile={{ name: renderedDiff.fileName, contents: artifact.newContent ?? "", lang: renderedDiff.language }}
                  options={diffOptions}
                  // Main-thread Shiki keeps onPostRender honest: readiness fires
                  // after the highlighted document mounts, not after a worker queues.
                  disableWorkerPool
                />
              </section>
            </div>
          </div>
        ) : (
          <div className={patchFileTree ? "patch-bundle-shell" : "patch-bundle-shell is-single-file"}>
            {patchFileTree ? (
              <FileTreeNav
                // useFileTree fixes its path set at mount. The wrapper synchronizes selection
                // in place, so only a real path-set change remounts the model.
                key={JSON.stringify(patchFileTree.paths)}
                paths={patchFileTree.paths}
                selectedPath={patchFileTree.selectedPath}
                ariaLabel="Changed files"
                onSelectPath={(path) => {
                  const fileId = patchFileTree.fileIdByPath.get(path);
                  if (fileId) {
                    handleFileSelect(fileId);
                  }
                }}
              />
            ) : null}
            <div className="patch-bundle-files">
              {renderedDiff.patchFiles.map((file) => (
                <section key={file.id} id={`patch-file-${file.id}`} className="patch-file-section">
                  <header className="patch-file-header">
                    <div>
                      <p className="section-kicker">{file.status}</p>
                      <h4>{file.displayPath}</h4>
                    </div>
                    {file.oldPath && file.newPath && file.oldPath !== file.newPath ? (
                      <span className="mono-pill">{file.oldPath} -&gt; {file.newPath}</span>
                    ) : null}
                  </header>
                  {file.isBinary || !file.meta ? (
                    <div className="artifact-empty-state">Binary patch preview is not expanded. Download the patch to inspect the raw binary diff headers.</div>
                  ) : (
                    // See disableWorkerPool rationale on MultiFileDiff above.
                    <FileDiff fileDiff={file.meta} options={diffOptions} disableWorkerPool />
                  )}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders diff artifacts as review-style unified/split views in the artifact stage.
 * Uses `artifact` diff payload details and optional `onReady` callback when the active diff UI is mount-ready.
 * Prefers parsed git patches, supports old/new content diffs, and falls back to raw patch output on parse/runtime errors.
 * Rendering is delegated to @pierre/diffs (Shiki-based, shadow DOM) with a theme-aware document surface.
 */
export function DiffRenderer({ artifact, onReady }: DiffRendererProps) {
  // Remount the renderer and its error boundary when the artifact contents change. The bounded
  // key avoids retaining a full decoded payload in React's child identity while giving every
  // meaningful diff input a fresh renderer lifecycle.
  const resetKey = useMemo(
    () =>
      [
        artifact.id,
        getContentKey(artifact.patch),
        getContentKey(artifact.oldContent),
        getContentKey(artifact.newContent),
        artifact.filename ?? "",
        artifact.language ?? "",
        artifact.view ?? "",
      ].join("::"),
    [
      artifact.id,
      artifact.patch,
      artifact.oldContent,
      artifact.newContent,
      artifact.filename,
      artifact.language,
      artifact.view,
    ],
  );

  return (
    <DiffRendererBoundary key={resetKey} artifact={artifact} onReady={onReady}>
      <DiffRendererContent artifact={artifact} onReady={onReady} />
    </DiffRendererBoundary>
  );
}
