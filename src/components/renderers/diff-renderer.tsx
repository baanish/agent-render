"use client";

import React, { Component, type ReactNode, useEffect, useMemo, useState } from "react";
import { Check, Columns2, Copy, Rows3 } from "lucide-react";
import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import { useTheme } from "next-themes";
import { detectCodeLanguage } from "@/lib/code/language";
import { parseGitPatchBundle } from "@/lib/diff/git-patch";
import type { DiffArtifact } from "@/lib/payload/schema";

type DiffRendererProps = {
  artifact: DiffArtifact;
  onReady?: () => void;
};

const NARROW_DIFF_BREAKPOINT = 640;
const MOBILE_DIFF_MEDIA_QUERY = `(max-width: ${NARROW_DIFF_BREAKPOINT}px)`;

type RenderableDiffFile = {
  meta: ReturnType<typeof parseGitPatchBundle>[number];
  diffFile: DiffFile | null;
};

type DiffRenderState =
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

function getDefaultMode(view: DiffArtifact["view"], isNarrowScreen: boolean) {
  return view === "split" && !isNarrowScreen ? DiffModeEnum.Split : DiffModeEnum.Unified;
}

function looksLikeUnifiedDiff(patch: string) {
  const normalized = patch.replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    return false;
  }

  return (
    /^diff --git /m.test(normalized) ||
    (/^--- /m.test(normalized) && /^\+\+\+ /m.test(normalized)) ||
    /^@@ /m.test(normalized) ||
    /^Binary files .* differ$/m.test(normalized) ||
    /^GIT binary patch$/m.test(normalized)
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
  resolvedTheme: ReturnType<typeof useTheme>["resolvedTheme"],
): RenderableDiffFile {
  if (patchFile.isBinary) {
    return {
      meta: patchFile,
      diffFile: null,
    };
  }

  const language = detectCodeLanguage(patchFile.newPath ?? patchFile.oldPath ?? undefined, artifact.language);
  const diffFile = new DiffFile(
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
} satisfies React.CSSProperties;

const diffFallbackPreStyle = {
  margin: 0,
  padding: "1rem 1.1rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.85rem",
  lineHeight: 1.65,
  color: "var(--text-primary)",
} satisfies React.CSSProperties;

const diffFallbackDetailStyle = {
  marginTop: "0.55rem",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.76rem",
} satisfies React.CSSProperties;

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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [artifact.id, rawPatch]);

  useEffect(() => {
    onReady?.();
  }, [artifact.id, onReady, rawPatch]);

  const handleCopyRawDiff = async () => {
    if (!rawPatch || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(rawPatch);
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

function DiffRendererContent({ artifact, onReady }: DiffRendererProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(getIsNarrowScreen);
  const [mode, setMode] = useState<DiffModeEnum>(() => getDefaultMode(artifact.view, getIsNarrowScreen()));

  useEffect(() => {
    setMounted(true);
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
        const patchFiles = parseGitPatchBundle(artifact.patch);
        const diffFiles = patchFiles.map((patchFile) => buildRenderablePatchFile(patchFile, artifact, resolvedTheme));

        return { kind: "rich", diffFiles };
      } catch (error) {
        return getFallbackState(
          artifact,
          "This patch could not be rendered as a valid unified diff. Showing the raw patch instead.",
          error,
        );
      }
    }

    if (artifact.oldContent !== undefined && artifact.newContent !== undefined) {
      try {
        const fileName = artifact.filename ?? artifact.id;
        const language = detectCodeLanguage(fileName, artifact.language);
        const diffFile = new DiffFile(`a/${fileName}`, artifact.oldContent, `b/${fileName}`, artifact.newContent, [], language, language);

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
  }, [artifact, resolvedTheme]);

  useEffect(() => {
    setIsReady(false);
    setActiveFileId(renderedDiff.kind === "rich" ? renderedDiff.diffFiles[0]?.meta.id ?? null : null);
  }, [renderedDiff]);

  useEffect(() => {
    if (!mounted || renderedDiff.kind !== "rich" || renderedDiff.diffFiles.length === 0) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsReady(true);
      onReady?.();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [mounted, onReady, renderedDiff]);

  if (renderedDiff.kind === "fallback") {
    return <DiffFallback artifact={artifact} message={renderedDiff.message} detail={renderedDiff.detail} onReady={onReady} />;
  }

  const { diffFiles } = renderedDiff;

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
      data-diff-mode={mode === DiffModeEnum.Split ? "split" : "unified"}
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
              className={`artifact-action ${mode === DiffModeEnum.Split ? "" : "is-primary"}`}
              onClick={() => setMode(mode === DiffModeEnum.Split ? DiffModeEnum.Unified : DiffModeEnum.Split)}
              aria-pressed={mode === DiffModeEnum.Split}
            >
              {mode === DiffModeEnum.Split ? <Rows3 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
              {mode === DiffModeEnum.Split ? "Back to unified" : "Open split columns"}
            </button>
          </div>
        ) : (
          <div className="diff-view-toggle">
            <button
              type="button"
              className={`artifact-action ${mode === DiffModeEnum.Unified ? "is-primary" : ""}`}
              onClick={() => setMode(DiffModeEnum.Unified)}
            >
              <Rows3 className="h-3.5 w-3.5" />
              Unified
            </button>
            <button
              type="button"
              className={`artifact-action ${mode === DiffModeEnum.Split ? "is-primary" : ""}`}
              onClick={() => setMode(DiffModeEnum.Split)}
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
                  ) : (
                    <DiffView
                      diffFile={diffFile}
                      diffViewMode={mode}
                      diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
                      diffViewFontSize={isNarrowScreen ? 12 : 13}
                      diffViewHighlight
                      diffViewWrap
                    />
                  )}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Public API for `DiffRenderer`. */
export function DiffRenderer({ artifact, onReady }: DiffRendererProps) {
  const resetKey = [
    artifact.id,
    artifact.patch ?? "",
    artifact.oldContent ?? "",
    artifact.newContent ?? "",
    artifact.filename ?? "",
    artifact.language ?? "",
    artifact.view ?? "",
  ].join("::");

  return (
    <DiffRendererBoundary artifact={artifact} onReady={onReady} resetKey={resetKey}>
      <DiffRendererContent artifact={artifact} onReady={onReady} />
    </DiffRendererBoundary>
  );
}
