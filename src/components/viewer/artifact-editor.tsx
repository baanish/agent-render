"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { numberFormatter } from "@/lib/format";
import {
  applyArtifactEditDraft,
  createArtifactEditDraft,
  createGeneratedEnvelopeLinkAsync,
  type ArtifactEditDraft,
  type GeneratedArtifactLink,
} from "@/lib/payload/link-creator";
import {
  codecs,
  type ArtifactKind,
  type ArtifactPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";
import { cn } from "@/lib/utils";

type ArtifactEditorProps = {
  artifact: ArtifactPayload;
  envelope: PayloadEnvelope;
  onPreviewHash: (hash: string) => void;
};

const fieldHints: Record<ArtifactKind, string> = {
  markdown: "Edit the markdown, then generate a new shareable link.",
  code: "Edit the snippet and keep the language hint when it helps.",
  diff: "Edit the unified git patch, then generate a new shareable link.",
  csv: "Edit the raw CSV, then generate a new shareable link.",
  json: "Edit the JSON, then generate a new shareable link.",
};

const codecOptions = ["auto", ...codecs] as const;

function getShareBaseUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL(withBasePath("/"), window.location.origin).toString();
}

function normalizePageBase(value: string) {
  return value.replace(/\/$/, "");
}

function isOnShareBase(shareBase: string) {
  const current = new URL(window.location.href);
  current.hash = "";
  return normalizePageBase(current.toString()) === normalizePageBase(shareBase);
}

function getBodyFieldLabel(kind: ArtifactKind) {
  return kind === "diff" ? "Patch" : "Content";
}

/**
 * In-viewer editor for the currently open artifact.
 *
 * Starts from the decoded artifact, lets the user correct title/body fields, and generates a new
 * fragment link without writing anything back to a server. Preview replaces the current hash so the
 * edited artifact renders immediately.
 */
export function ArtifactEditor({
  artifact,
  envelope,
  onPreviewHash,
}: ArtifactEditorProps) {
  const [{ draft, version: draftVersion }, setDraftState] = useState(() => ({
    draft: createArtifactEditDraft(artifact),
    version: 0,
  }));
  const [generatedLink, setGeneratedLink] =
    useState<GeneratedArtifactLink | null>(null);
  const [generatedVersion, setGeneratedVersion] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [markdownLinkCopyState, setMarkdownLinkCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const generationRequestRef = useRef(0);
  const copyTokenRef = useRef(0);
  const markdownCopyTokenRef = useRef(0);
  const resultRef = useRef<HTMLElement | null>(null);
  const isGeneratedLinkStale =
    Boolean(generatedLink) && draftVersion !== generatedVersion;
  const usesPairDiff = draft.kind === "diff" && draft.diffSource === "pair";
  const contentFieldLabel = getBodyFieldLabel(draft.kind);

  useEffect(() => {
    copyTokenRef.current += 1;
    markdownCopyTokenRef.current += 1;
    setCopyState("idle");
    setMarkdownLinkCopyState("idle");
    setError(null);
  }, [draftVersion]);

  const updateDraft = <K extends keyof ArtifactEditDraft>(
    field: K,
    value: ArtifactEditDraft[K],
  ) => {
    setDraftState((current) => {
      if (Object.is(current.draft[field], value)) {
        return current;
      }

      return {
        draft: {
          ...current.draft,
          [field]: value,
        },
        version: current.version + 1,
      };
    });
  };

  const handleGenerate = async () => {
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    setIsGenerating(true);

    try {
      const nextGeneratedLink = await createGeneratedEnvelopeLinkAsync(
        applyArtifactEditDraft(envelope, draft),
        getShareBaseUrl(),
        draft.codec,
      );
      if (generationRequestRef.current !== requestId) {
        return;
      }

      setGeneratedLink(nextGeneratedLink);
      setGeneratedVersion(draftVersion);
      copyTokenRef.current += 1;
      markdownCopyTokenRef.current += 1;
      setError(null);
      setCopyState("idle");
      setMarkdownLinkCopyState("idle");
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView?.({ block: "nearest" });
      });
    } catch (generationError) {
      if (generationRequestRef.current !== requestId) {
        return;
      }

      setGeneratedLink(null);
      setGeneratedVersion(-1);
      setCopyState("idle");
      setMarkdownLinkCopyState("idle");
      setError(
        generationError instanceof Error
          ? generationError.message
          : "The link could not be generated.",
      );
    } finally {
      if (generationRequestRef.current === requestId) {
        setIsGenerating(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!generatedLink || isGeneratedLinkStale) {
      return;
    }

    const requestToken = ++copyTokenRef.current;
    const expectedHash = generatedLink.hash;

    try {
      await copyTextToClipboard(generatedLink.url);
      if (copyTokenRef.current !== requestToken || generatedLink.hash !== expectedHash) {
        return;
      }
      setCopyState("copied");
    } catch {
      if (copyTokenRef.current !== requestToken || generatedLink.hash !== expectedHash) {
        return;
      }
      setCopyState("failed");
    }
  };

  const handleCopyMarkdownLink = async () => {
    if (!generatedLink || isGeneratedLinkStale) {
      return;
    }

    const requestToken = ++markdownCopyTokenRef.current;
    const expectedHash = generatedLink.hash;

    try {
      await copyTextToClipboard(generatedLink.markdownLink);
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLink.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("copied");
    } catch {
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLink.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("failed");
    }
  };

  const handlePreview = () => {
    if (!generatedLink || isGeneratedLinkStale) {
      return;
    }

    const shareBase = getShareBaseUrl();
    if (shareBase && !isOnShareBase(shareBase)) {
      window.location.assign(generatedLink.url);
      return;
    }

    onPreviewHash(generatedLink.hash);
  };

  return (
    <div className="artifact-editor" data-testid="artifact-editor">
      <p className="text-sm leading-7 text-[color:var(--text-muted)]">
        Editing creates a new shareable link. The current URL stays put until
        you preview or copy the new one.
      </p>

      <form
        className="creator-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate();
        }}
      >
        <label className="creator-field">
          <span className="metric-label">Title</span>
          <input
            name="title"
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            className="creator-input"
          />
        </label>

        <label className="creator-field">
          <span className="metric-label">Filename</span>
          <input
            name="filename"
            value={draft.filename}
            onChange={(event) => updateDraft("filename", event.target.value)}
            className="creator-input"
          />
        </label>

        {draft.kind === "code" ? (
          <label className="creator-field">
            <span className="metric-label">Language</span>
            <input
              name="language"
              value={draft.language}
              onChange={(event) => updateDraft("language", event.target.value)}
              placeholder="tsx"
              className="creator-input"
            />
          </label>
        ) : null}

        {draft.kind === "diff" ? (
          <label className="creator-field">
            <span className="metric-label">Diff view</span>
            <select
              name="diffView"
              value={draft.diffView}
              onChange={(event) =>
                updateDraft(
                  "diffView",
                  event.target.value as ArtifactEditDraft["diffView"],
                )
              }
              className="creator-input"
            >
              <option value="unified">Unified</option>
              <option value="split">Split</option>
            </select>
          </label>
        ) : null}

        {usesPairDiff ? (
          <>
            <label className="creator-field creator-field-full">
              <span className="creator-field-head">
                <span className="metric-label">Old content</span>
              </span>
              <textarea
                name="oldContent"
                value={draft.oldContent ?? ""}
                onChange={(event) =>
                  updateDraft("oldContent", event.target.value)
                }
                className="creator-textarea"
                rows={8}
                data-testid="artifact-editor-old-content"
              />
            </label>
            <label className="creator-field creator-field-full">
              <span className="creator-field-head">
                <span className="metric-label">New content</span>
              </span>
              <textarea
                name="newContent"
                value={draft.newContent ?? ""}
                onChange={(event) =>
                  updateDraft("newContent", event.target.value)
                }
                className="creator-textarea"
                rows={8}
                data-testid="artifact-editor-new-content"
              />
            </label>
          </>
        ) : (
          <label className="creator-field creator-field-full">
            <span className="creator-field-head">
              <span className="metric-label">{contentFieldLabel}</span>
              <span className="creator-field-hint">
                {fieldHints[draft.kind]}
              </span>
            </span>
            <textarea
              name="content"
              value={draft.content}
              onChange={(event) => updateDraft("content", event.target.value)}
              className="creator-textarea"
              rows={14}
              autoFocus
              data-testid="artifact-editor-content"
            />
          </label>
        )}

        <div className="creator-form-footer creator-field-full">
          <button
            type="submit"
            className="artifact-action is-primary"
            disabled={isGenerating}
          >
            <Link2 className="h-3.5 w-3.5" />
            {isGenerating ? "Generating…" : "Generate new link"}
          </button>
          <div
            className="creator-codec-row"
            role="group"
            aria-label="Compression algorithm"
          >
            <span className="metric-label">Compression</span>
            {codecOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={cn(
                  "artifact-action",
                  (draft.codec ?? "auto") === option && "is-primary",
                )}
                aria-pressed={(draft.codec ?? "auto") === option}
                onClick={() => updateDraft("codec", option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </form>

      {generatedLink ? (
        <aside
          ref={resultRef}
          className="creator-result-card"
          data-testid="artifact-editor-result"
        >
          <div className="creator-result-head">
            <div>
              <p className="section-kicker">New link</p>
              <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                Ready to share
              </h4>
            </div>
            <span className="mono-pill">{generatedLink.artifact.kind}</span>
          </div>

          <div className="creator-link-frame">
            <p className="metric-label">URL</p>
            <textarea
              className="creator-link-output"
              value={generatedLink.url}
              readOnly
              aria-label="Generated agent-render link"
              rows={4}
            />
          </div>

          <div className="creator-link-frame">
            <p className="metric-label">Markdown link</p>
            <textarea
              className="creator-link-output"
              value={generatedLink.markdownLink}
              readOnly
              aria-label="Generated markdown link"
              rows={3}
            />
          </div>

          <div className="creator-result-metrics">
            <div className="metric-card">
              <p className="metric-label">Codec</p>
              <p className="metric-value">{generatedLink.codec}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Fragment size</p>
              <p className="metric-value">
                {numberFormatter.format(generatedLink.fragmentLength)} chars
              </p>
            </div>
          </div>

          {generatedLink.discordMarkdownLinkWarning ? (
            <div className="creator-warning-state" role="status">
              {generatedLink.discordMarkdownLinkWarning}
            </div>
          ) : null}

          <div className="creator-result-actions">
            <button
              type="button"
              className={cn(
                "artifact-action",
                copyState === "copied" && "is-primary",
              )}
              disabled={isGeneratedLinkStale}
              onClick={() => {
                void handleCopy();
              }}
            >
              {copyState === "copied" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy link"}
            </button>
            <button
              type="button"
              className={cn(
                "artifact-action",
                markdownLinkCopyState === "copied" && "is-primary",
              )}
              disabled={isGeneratedLinkStale}
              onClick={() => {
                void handleCopyMarkdownLink();
              }}
            >
              {markdownLinkCopyState === "copied" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              {markdownLinkCopyState === "copied"
                ? "Copied"
                : markdownLinkCopyState === "failed"
                  ? "Copy failed"
                  : "Copy markdown link"}
            </button>
            <button
              type="button"
              className="artifact-action is-primary"
              disabled={isGeneratedLinkStale}
              onClick={handlePreview}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Preview here
            </button>
            <a
              href={isGeneratedLinkStale ? undefined : generatedLink.url}
              target="_blank"
              rel="noreferrer"
              className="artifact-action"
              aria-disabled={isGeneratedLinkStale}
              onClick={(event) => {
                if (isGeneratedLinkStale) {
                  event.preventDefault();
                }
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
          </div>

          {isGeneratedLinkStale ? (
            <p className="creator-inline-status" role="status">
              Draft changed since last generation.
            </p>
          ) : null}
        </aside>
      ) : null}

      {error ? (
        <div className="creator-error-state" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
