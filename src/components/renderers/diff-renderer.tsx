"use client";

import dynamic from "next/dynamic";
import { Component, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, Columns2, Copy, Rows3 } from "lucide-react";
import { PatchDiff, MultiFileDiff, type FileDiffProps } from "@/lib/diff/pierre-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { detectCodeLanguage, toPierreLanguage } from "@/lib/code/language";
import { useResolvedTheme } from "@/components/theme/use-theme-controller";
import { getPatchFileLabels, getRenderablePatchFiles, parseGitPatchBundle } from "@/lib/diff/git-patch";
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

type RenderablePatchFile = {
  meta: ReturnType<typeof parseGitPatchBundle>[number];
};

type DiffRenderState =
  | {
      kind: "rich-patch";
      patchFiles: RenderablePatchFile[];
    }
  | {
      kind: "rich-contents";
      fileName: string;
      language: string | undefined;
    }
  | {
      kind: "fallback";
      message: string;
      rawPatch: string;
      detail?: string;
    };

type DiffRendererBoundaryProps = {
  artifact: DiffArtifact;
  onReady?: () => void;
  children: ReactNode;
  resetKey: string;
};

type DiffRendererBoundaryState = {
  error: Error | null;
};

function getIsNarrowScreen() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_DIFF_MEDIA_QUERY).matches;
}

function hashResetValue(value: string | undefined): string {
  if (value === undefined) {
    return "u";
  }

  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${value.length}:${(hash >>> 0).toString(36)}`;
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

function looksLikeUnifiedDiff(patch: string) {
  if (!/\S/.test(patch)) {
    return false;
  }

  return (
    /^diff --git /m.test(patch) ||
    (/^--- /m.test(patch) && /^\+\+\+ /m.test(patch)) ||
    /^@@ /m.test(patch) ||
    /^Binary files .* differ\r?$/m.test(patch) ||
    /^GIT binary patch\r?$/m.test(patch)
  );
}

function getRawPatch(artifact: DiffArtifact) {
  return artifact.patch ?? "";
}

function getFallbackState(artifact: DiffArtifact, message: string, error?: unknown): DiffRenderState {
  const detail = error instanceof Error ? error.message : undefined;

  return {
    kind: "fallback",
    message,
    rawPatch: getRawPatch(artifact),
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

  componentDidUpdate(previousProps: DiffRendererBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
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
  const [mounted, setMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(getIsNarrowScreen);
  const [mode, setMode] = useState<DiffViewMode>(() => getDefaultMode(artifact.view, getIsNarrowScreen()));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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

  useEffect(() => {
    setMode(getDefaultMode(artifact.view, isNarrowScreen));
  }, [artifact.id, artifact.view, isNarrowScreen]);

  const renderedDiff = useMemo<DiffRenderState>(() => {
    if (artifact.patch) {
      if (!looksLikeUnifiedDiff(artifact.patch)) {
        return getFallbackState(
          artifact,
          "This patch is not a valid unified diff, so the raw patch is shown instead.",
        );
      }

      try {
        const patchFiles = getRenderablePatchFiles(parseGitPatchBundle(artifact.patch));
        return {
          kind: "rich-patch",
          patchFiles: patchFiles.map((meta) => ({ meta })),
        };
      } catch (error) {
        return getFallbackState(
          artifact,
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
      artifact,
      "This diff artifact does not include a valid patch payload to render.",
    );
  }, [artifact]);

  const readyTimerRef = useRef<number | null>(null);

  // Render-time adjustment (replay-safe): a new renderedDiff resets readiness and
  // restores the first-file selection before the tree mounts, so the rail's
  // initialSelectedPaths lands on mount instead of one render late. The pending
  // readiness timer is cleared too, so a quiet window measured against the old
  // diff cannot mark the new one ready early.
  const [previousRenderedDiff, setPreviousRenderedDiff] = useState(renderedDiff);
  if (previousRenderedDiff !== renderedDiff) {
    setPreviousRenderedDiff(renderedDiff);
    window.clearTimeout(readyTimerRef.current ?? undefined);
    readyTimerRef.current = null;
    setIsReady(false);
    setActiveFileId(renderedDiff.kind === "rich-patch" ? renderedDiff.patchFiles[0]?.meta.id ?? null : null);
  }

  const patchFileTree = useMemo(() => {
    if (renderedDiff.kind !== "rich-patch" || renderedDiff.patchFiles.length <= 1) {
      return null;
    }

    const labels = getPatchFileLabels(renderedDiff.patchFiles.map((file) => file.meta));
    const fileIdByPath = new Map<string, string>();
    const paths: string[] = [];
    for (const { meta } of renderedDiff.patchFiles) {
      const label = labels.get(meta.id) ?? meta.displayPath;
      fileIdByPath.set(label, meta.id);
      paths.push(label);
    }
    const selectedId =
      renderedDiff.patchFiles.find(({ meta }) => meta.id === activeFileId)?.meta.id ??
      renderedDiff.patchFiles[0]?.meta.id;
    const selectedPath = selectedId ? labels.get(selectedId) : undefined;

    return { fileIdByPath, paths, selectedPath };
  }, [renderedDiff, activeFileId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(readyTimerRef.current ?? undefined);
    };
  }, []);

  // A bare frame after mount races the highlighter: Shiki can resolve a cold
  // engine after the first render pass, and Pierre re-emits an "update"
  // post-render once the tokens land. Readiness waits for a quiet window after
  // the last emit instead of a fixed delay.
  const diffOptions = useMemo<DiffOptions>(
    () => ({
      ...getDiffOptions(mode, resolvedTheme),
      onPostRender: (_node, _instance, phase) => {
        if (phase === "unmount") {
          return;
        }
        window.clearTimeout(readyTimerRef.current ?? undefined);
        readyTimerRef.current = window.setTimeout(() => {
          setIsReady(true);
          onReadyRef.current?.();
        }, 200);
      },
    }),
    [mode, resolvedTheme],
  );

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
          <div className="diff-view-toggle">
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
          <div className="diff-view-toggle">
            <button
              type="button"
              className={`artifact-action ${mode === "unified" ? "is-depressed" : ""}`}
              onClick={() => setMode("unified")}
            >
              <Rows3 className="h-3.5 w-3.5" />
              Unified
            </button>
            <button
              type="button"
              className={`artifact-action ${mode === "split" ? "is-depressed" : ""}`}
              onClick={() => setMode("split")}
            >
              <Columns2 className="h-3.5 w-3.5" />
              Split
            </button>
          </div>
        )}
      </div>
      <div className="diff-renderer-frame">
        {mounted ? (
          renderedDiff.kind === "rich-contents" ? (
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
                    disableWorkerPool
                  />
                </section>
              </div>
            </div>
          ) : (
            <div className={patchFileTree ? "patch-bundle-shell" : "patch-bundle-shell is-single-file"}>
              {patchFileTree ? (
                <FileTreeNav
                  // useFileTree applies initialSelectedPaths only on mount; remount on
                  // artifact or path-set changes so the initial row lands selected.
                  // Clicks self-select inside the tree, so selection is not keyed here
                  // (keying it would discard the rail's search/scroll state per click).
                  key={`${artifact.id}::${patchFileTree.paths.join("::")}`}
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
                {renderedDiff.patchFiles.map(({ meta }) => (
                  <section key={meta.id} id={`patch-file-${meta.id}`} className="patch-file-section">
                    <header className="patch-file-header">
                      <div>
                        <p className="section-kicker">{meta.status}</p>
                        <h4>{meta.displayPath}</h4>
                      </div>
                      {meta.oldPath && meta.newPath && meta.oldPath !== meta.newPath ? (
                        <span className="mono-pill">{meta.oldPath} -&gt; {meta.newPath}</span>
                      ) : null}
                    </header>
                    {meta.isBinary ? (
                      <div className="artifact-empty-state">Binary patch preview is not expanded. Download the patch to inspect the raw binary diff headers.</div>
                    ) : (
                      <PatchDiff patch={meta.patch} options={diffOptions} disableWorkerPool />
                    )}
                  </section>
                ))}
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders diff artifacts as review-style unified/split views in the artifact stage.
 * Uses `artifact` diff payload details and optional `onReady` callback when the active diff UI is mount-ready.
 * Prefers parsed git patches, supports old/new content diffs, and falls back to raw patch output on parse/runtime errors.
 * Rendering is delegated to @pierre/diffs (Shiki-based, shadow DOM); the diff bodies stay dark in both app themes.
 */
export function DiffRenderer({ artifact, onReady }: DiffRendererProps) {
  // resetKey hashes patch/content (FNV-1a + length) as a deliberate bound to avoid embedding huge
  // patches into a React key on every render; a hash collision could fail to clear a stuck error
  // boundary, which is accepted as the cost of not concatenating large payloads into the key.
  const resetKey = useMemo(
    () =>
      [
        artifact.id,
        hashResetValue(artifact.patch),
        hashResetValue(artifact.oldContent),
        hashResetValue(artifact.newContent),
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
    <DiffRendererBoundary artifact={artifact} onReady={onReady} resetKey={resetKey}>
      <DiffRendererContent artifact={artifact} onReady={onReady} />
    </DiffRendererBoundary>
  );
}
