"use client";

import { Component, type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, Columns2, Copy, Rows3 } from "lucide-react";
import { useResolvedTheme, type ResolvedTheme } from "@/components/theme/use-theme-controller";
import { copyTextToClipboard } from "@/lib/copy-text";
import { detectCodeLanguage } from "@/lib/code/language";
import { parseGitPatchBundle } from "@/lib/diff/git-patch";
import type { DiffArtifact } from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";

type DiffRendererProps = {
  artifact: DiffArtifact;
  onReady?: () => void;
};

const NARROW_DIFF_BREAKPOINT = 640;
const MOBILE_DIFF_MEDIA_QUERY = `(max-width: ${NARROW_DIFF_BREAKPOINT}px)`;
const DIFF_VIEW_STYLESHEET_ID = "agent-render-diff-view-styles";
const diffViewStylesheetHrefs = [
  withBasePath("/vendor/diff-view-pure.css.br"),
  withBasePath("/vendor/diff-view-pure.css"),
];

let diffViewStylesheetPromise: Promise<void> | null = null;

type DiffViewModule = typeof import("@git-diff-view/react");
type DiffViewLibrary = Pick<DiffViewModule, "DiffFile" | "DiffModeEnum" | "DiffView">;
type DiffViewMode = "unified" | "split";
type DiffFileInstance = InstanceType<DiffViewLibrary["DiffFile"]>;

type RenderableDiffFile = {
  meta: ReturnType<typeof parseGitPatchBundle>[number];
  diffFile: DiffFileInstance | null;
};

type DiffRenderState =
  | {
      kind: "loading";
    }
  | {
      kind: "rich";
      diffFiles: RenderableDiffFile[];
    }
  | {
      kind: "fallback";
      message: string;
      rawPatch: string;
      detail?: string;
    };

type ParsedPatchBundleState =
  | {
      kind: "none";
    }
  | {
      kind: "invalid-shape";
    }
  | {
      error: unknown;
      kind: "parse-error";
    }
  | {
      kind: "parsed";
      patchFiles: ReturnType<typeof parseGitPatchBundle>;
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

function getDiffLibraryMode(mode: DiffViewMode, diffLibrary: DiffViewLibrary) {
  return mode === "split" ? diffLibrary.DiffModeEnum.Split : diffLibrary.DiffModeEnum.Unified;
}

function patchFilesNeedDiffLibrary(patchFiles: ReturnType<typeof parseGitPatchBundle>): boolean {
  for (const patchFile of patchFiles) {
    if (!patchFile.isBinary) {
      return true;
    }
  }

  return false;
}

function diffFilesHaveRenderableFile(diffFiles: RenderableDiffFile[]): boolean {
  for (const { diffFile } of diffFiles) {
    if (diffFile) {
      return true;
    }
  }

  return false;
}

function loadStylesheetHref(href: string) {
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");

    const cleanup = () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      link.dataset.loaded = "true";
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      link.remove();
      reject(new Error(`Diff view stylesheet failed to load: ${href}`));
    };

    link.id = DIFF_VIEW_STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", handleLoad);
    link.addEventListener("error", handleError);
    document.head.appendChild(link);
  });
}

function loadDiffViewStylesheet() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingLink = document.getElementById(DIFF_VIEW_STYLESHEET_ID) as HTMLLinkElement | null;

  if (existingLink?.dataset.loaded === "true" || existingLink?.sheet) {
    if (existingLink) {
      existingLink.dataset.loaded = "true";
    }
    return Promise.resolve();
  }

  if (diffViewStylesheetPromise && !existingLink) {
    diffViewStylesheetPromise = null;
  }

  if (diffViewStylesheetPromise) {
    return diffViewStylesheetPromise;
  }

  existingLink?.remove();

  diffViewStylesheetPromise = (async () => {
    let lastError: unknown;

    for (const href of diffViewStylesheetHrefs) {
      try {
        await loadStylesheetHref(href);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Diff view stylesheet failed to load.");
  })().catch((error) => {
    diffViewStylesheetPromise = null;
    throw error;
  });

  return diffViewStylesheetPromise;
}

function removeDiffViewStylesheet() {
  document.getElementById(DIFF_VIEW_STYLESHEET_ID)?.remove();
  diffViewStylesheetPromise = null;
}

function looksLikeUnifiedDiff(patch: string) {
  if (!/\S/.test(patch)) {
    return false;
  }

  return (
    /^diff --git /m.test(patch) ||
    (/^--- /m.test(patch) && /^\+\+\+ /m.test(patch)) ||
    /^@@ /m.test(patch) ||
    /^Binary files .* differ$/m.test(patch) ||
    /^GIT binary patch$/m.test(patch)
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

function buildRenderablePatchFile(
  patchFile: ReturnType<typeof parseGitPatchBundle>[number],
  artifact: DiffArtifact,
  resolvedTheme: ResolvedTheme,
  diffLibrary: DiffViewLibrary,
): RenderableDiffFile {
  if (patchFile.isBinary) {
    return {
      meta: patchFile,
      diffFile: null,
    };
  }

  const language = detectCodeLanguage(patchFile.newPath ?? patchFile.oldPath ?? undefined, artifact.language);
  const diffFile = new diffLibrary.DiffFile(
    patchFile.oldPath ? `a/${patchFile.oldPath}` : "/dev/null",
    "",
    patchFile.newPath ? `b/${patchFile.newPath}` : "/dev/null",
    "",
    [patchFile.patch],
    language,
    language,
  );

  diffFile.initTheme(resolvedTheme === "dark" ? "dark" : "light");
  diffFile.init();
  diffFile.buildSplitDiffLines();
  diffFile.buildUnifiedDiffLines();

  return {
    meta: patchFile,
    diffFile,
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
        <div className="code-renderer-meta">
          <span className="mono-pill">raw patch fallback</span>
          <span className="section-kicker">invalid unified diff</span>
        </div>
        {rawPatch ? (
          <button type="button" className={`artifact-action ${copyState === "copied" ? "is-primary" : ""}`} onClick={handleCopyRawDiff}>
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

function DiffLoading({
  mode,
  isNarrowScreen,
}: {
  mode: DiffViewMode;
  isNarrowScreen: boolean;
}) {
  return (
    <div
      className="diff-renderer-shell"
      data-testid="renderer-diff"
      data-renderer-ready="false"
      data-diff-state="loading"
      data-diff-mode={mode}
      data-diff-controls={isNarrowScreen ? "gated" : "full"}
      data-mobile-layout={isNarrowScreen ? "true" : "false"}
    >
      <div className="artifact-empty-state" role="status">
        <p>Preparing the rich diff renderer.</p>
      </div>
    </div>
  );
}

function DiffRendererContent({ artifact, onReady }: DiffRendererProps) {
  const resolvedTheme = useResolvedTheme();
  const onReadyRef = useRef(onReady);
  const [diffLibrary, setDiffLibrary] = useState<DiffViewLibrary | null>(null);
  const [diffLibraryError, setDiffLibraryError] = useState<Error | null>(null);
  const [mounted, setMounted] = useState(false);
  const [stylesReady, setStylesReady] = useState(false);
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

  const parsedPatchBundle = useMemo<ParsedPatchBundleState>(() => {
    if (!artifact.patch) {
      return { kind: "none" };
    }

    if (!looksLikeUnifiedDiff(artifact.patch)) {
      return { kind: "invalid-shape" };
    }

    try {
      return { kind: "parsed", patchFiles: parseGitPatchBundle(artifact.patch) };
    } catch (error) {
      return { error, kind: "parse-error" };
    }
  }, [artifact.patch]);

  const shouldLoadDiffLibrary = useMemo(() => {
    if (artifact.oldContent !== undefined && artifact.newContent !== undefined) {
      return true;
    }

    return parsedPatchBundle.kind === "parsed" && patchFilesNeedDiffLibrary(parsedPatchBundle.patchFiles);
  }, [artifact.oldContent, artifact.newContent, parsedPatchBundle]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldLoadDiffLibrary) {
      setDiffLibraryError(null);
      return () => {
        cancelled = true;
      };
    }

    if (diffLibrary) {
      return () => {
        cancelled = true;
      };
    }

    setDiffLibraryError(null);
    import("@git-diff-view/react")
      .then((module) => {
        if (!cancelled) {
          setDiffLibrary(module);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDiffLibraryError(error instanceof Error ? error : new Error("Failed to load the rich diff renderer."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.id, diffLibrary, shouldLoadDiffLibrary]);

  const renderedDiff = useMemo<DiffRenderState>(() => {
    if (diffLibraryError) {
      return getFallbackState(
        artifact,
        "The rich diff renderer could not be loaded. Showing the raw patch instead.",
        diffLibraryError,
      );
    }

    if (artifact.patch) {
      if (parsedPatchBundle.kind === "invalid-shape") {
        return getFallbackState(
          artifact,
          "This patch is not a valid unified diff, so the raw patch is shown instead.",
        );
      }

      if (parsedPatchBundle.kind === "parse-error") {
        return getFallbackState(
          artifact,
          "This patch could not be rendered as a valid unified diff. Showing the raw patch instead.",
          parsedPatchBundle.error,
        );
      }

      if (parsedPatchBundle.kind === "parsed") {
        const patchFiles = parsedPatchBundle.patchFiles;
        const diffFiles = new Array<RenderableDiffFile>(patchFiles.length);

        for (let index = 0; index < patchFiles.length; index += 1) {
          const patchFile = patchFiles[index]!;
          if (!diffLibrary && !patchFile.isBinary) {
            return { kind: "loading" };
          }

          diffFiles[index] = diffLibrary
            ? buildRenderablePatchFile(patchFile, artifact, resolvedTheme, diffLibrary)
            : { meta: patchFile, diffFile: null };
        }

        return { kind: "rich", diffFiles };
      }
    }

    if (artifact.oldContent !== undefined && artifact.newContent !== undefined) {
      if (!diffLibrary) {
        return { kind: "loading" };
      }

      try {
        const fileName = artifact.filename ?? artifact.id;
        const language = detectCodeLanguage(fileName, artifact.language);
        const diffFile = new diffLibrary.DiffFile(`a/${fileName}`, artifact.oldContent, `b/${fileName}`, artifact.newContent, [], language, language);

        diffFile.initTheme(resolvedTheme === "dark" ? "dark" : "light");
        diffFile.init();
        diffFile.buildSplitDiffLines();
        diffFile.buildUnifiedDiffLines();

        return {
          kind: "rich",
          diffFiles: [
            {
              meta: {
                id: artifact.id,
                patch: "",
                oldPath: artifact.filename ?? null,
                newPath: artifact.filename ?? null,
                displayPath: artifact.filename ?? artifact.id,
                status: "modified",
                isBinary: false,
              },
              diffFile,
            },
          ],
        };
      } catch (error) {
        return getFallbackState(
          artifact,
          "This before-and-after diff could not be rendered, so the rich diff view has been skipped.",
          error,
        );
      }
    }

    return getFallbackState(
      artifact,
      "This diff artifact does not include a valid patch payload to render.",
    );
  }, [artifact, diffLibrary, diffLibraryError, parsedPatchBundle, resolvedTheme]);

  useEffect(() => {
    setIsReady(false);
    setActiveFileId(renderedDiff.kind === "rich" ? renderedDiff.diffFiles[0]?.meta.id ?? null : null);
  }, [renderedDiff]);

  useEffect(() => {
    let cancelled = false;

    if (renderedDiff.kind !== "rich" || !diffFilesHaveRenderableFile(renderedDiff.diffFiles)) {
      setStylesReady(true);
      removeDiffViewStylesheet();
      return;
    }

    setStylesReady(false);
    loadDiffViewStylesheet()
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) {
          setStylesReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [renderedDiff]);

  useEffect(() => {
    if (!mounted || !stylesReady || renderedDiff.kind !== "rich" || renderedDiff.diffFiles.length === 0) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsReady(true);
      onReadyRef.current?.();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [mounted, renderedDiff, stylesReady]);

  if (renderedDiff.kind === "fallback") {
    return <DiffFallback artifact={artifact} message={renderedDiff.message} detail={renderedDiff.detail} onReady={onReady} />;
  }

  if (renderedDiff.kind === "loading") {
    return <DiffLoading mode={mode} isNarrowScreen={isNarrowScreen} />;
  }

  const { diffFiles } = renderedDiff;
  const RichDiffView = diffLibrary?.DiffView;
  const richDiffMode = diffLibrary ? getDiffLibraryMode(mode, diffLibrary) : null;

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
        <div className="code-renderer-meta">
          <span className="mono-pill">review-style diff</span>
          <span className="section-kicker">syntax highlighted</span>
        </div>
        {isNarrowScreen ? (
          <div className="diff-view-toggle">
            <span className="mono-pill diff-mobile-note">Unified is the phone default</span>
            <button
              type="button"
              className={`artifact-action ${mode === "split" ? "" : "is-primary"}`}
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
              className={`artifact-action ${mode === "unified" ? "is-primary" : ""}`}
              onClick={() => setMode("unified")}
            >
              <Rows3 className="h-3.5 w-3.5" />
              Unified
            </button>
            <button
              type="button"
              className={`artifact-action ${mode === "split" ? "is-primary" : ""}`}
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
          <div className="patch-bundle-shell">
            <nav className="patch-bundle-nav">
              {diffFiles.map(({ meta }) => (
                <button
                  key={meta.id}
                  type="button"
                  className={`patch-bundle-link ${activeFileId === meta.id ? "is-active" : ""}`}
                  onClick={() => handleFileSelect(meta.id)}
                >
                  <span className="mono-pill">{meta.status}</span>
                  <span className="truncate">{meta.displayPath}</span>
                </button>
              ))}
            </nav>
            <div className="patch-bundle-files">
              {diffFiles.map(({ meta, diffFile }) => (
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
                  {meta.isBinary || !diffFile ? (
                    <div className="artifact-empty-state">Binary patch preview is not expanded. Download the patch to inspect the raw binary diff headers.</div>
                  ) : RichDiffView && richDiffMode ? (
                    <RichDiffView
                      diffFile={diffFile}
                      diffViewMode={richDiffMode}
                      diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
                      diffViewFontSize={isNarrowScreen ? 12 : 13}
                      diffViewHighlight
                      diffViewWrap
                    />
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Renders diff artifacts as review-style unified/split views in the artifact stage.
 * Uses `artifact` diff payload details and optional `onReady` callback when the active diff UI is mount-ready.
 * Prefers parsed git patches, supports old/new content diffs, and falls back to raw patch output on parse/runtime errors.
 */
export function DiffRenderer({ artifact, onReady }: DiffRendererProps) {
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
