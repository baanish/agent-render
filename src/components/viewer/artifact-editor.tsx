"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { numberFormatter } from "@/lib/format";
import { parseGitPatchBundle, type ParsedPatchFile } from "@/lib/diff/git-patch";
import {
  applyArtifactEditDraft,
  createArtifactEditDraft,
  createGeneratedEnvelopeLinkAsync,
  type ArtifactEditDraft,
  type GeneratedArtifactLink,
} from "@/lib/payload/link-creator";
import {
  codecPickerLabel,
  codecs,
  isDeprecatedEmitCodec,
  type ArtifactKind,
  type ArtifactPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";
import { cn } from "@/lib/utils";

// The Trees runtime is only worth loading when the open diff artifact is a multi-file patch.
const PatchFileTree = dynamic(
  () => import("@/components/patch-file-tree").then((module) => module.PatchFileTree),
  { ssr: false },
);

type ArtifactEditorProps = {
  artifact: ArtifactPayload;
  envelope: PayloadEnvelope;
  onPreviewHash: (hash: string) => void;
};

const EMPTY_PATCH_FILES: ParsedPatchFile[] = [];
const PATCH_SECTION_HEADER_PATTERN = /^diff --git /gm;

// Maps each parsed file to its byte offset inside the raw patch text so tree
// selection can move the textarea caret. The parser trims/normalizes sections,
// so offsets are recovered from the `diff --git` header positions instead of
// indexOf on the (mutated) section text. A leading preamble section has no
// header and always sits at offset 0.
function getPatchFileOffsets(content: string, files: ParsedPatchFile[]): Map<string, number> {
  const headerOffsets: number[] = [];
  PATCH_SECTION_HEADER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATCH_SECTION_HEADER_PATTERN.exec(content)) !== null) {
    headerOffsets.push(match.index);
  }

  const offsets = new Map<string, number>();
  let headerIndex = 0;
  for (const file of files) {
    if (file.patch.startsWith("diff --git")) {
      offsets.set(file.id, headerOffsets[headerIndex] ?? 0);
      headerIndex += 1;
    } else {
      offsets.set(file.id, 0);
    }
  }

  return offsets;
}

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
  const patchTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const patchFiles = useMemo(() => {
    if (draft.kind !== "diff" || draft.diffSource !== "patch") {
      return EMPTY_PATCH_FILES;
    }

    try {
      return parseGitPatchBundle(draft.content);
    } catch {
      // The patch mid-edit may be malformed; the tree hides until it parses again.
      return EMPTY_PATCH_FILES;
    }
  }, [draft.kind, draft.diffSource, draft.content]);
  const patchFilePaths = useMemo(() => patchFiles.map((file) => file.displayPath), [patchFiles]);
  const patchFileByPath = useMemo(
    () => new Map(patchFiles.map((file) => [file.displayPath, file])),
    [patchFiles],
  );
  const patchFileOffsets = useMemo(
    () => getPatchFileOffsets(draft.content, patchFiles),
    [draft.content, patchFiles],
  );
  const showPatchFileTree = patchFiles.length > 1;

  const handlePatchFileSelect = (path: string) => {
    const file = patchFileByPath.get(path);
    const textarea = patchTextareaRef.current;
    if (!file || !textarea) {
      return;
    }

    const offset = patchFileOffsets.get(file.id) ?? 0;
    const lineIndex = draft.content.slice(0, offset).split("\n").length - 1;
    const measuredLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight);
    const lineHeight = Number.isFinite(measuredLineHeight) ? measuredLineHeight : 18;

    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (lineIndex - 1) * lineHeight);
  };

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
          <div className="creator-field creator-field-full">
            <span className="creator-field-head">
              <label className="metric-label" htmlFor="artifact-editor-content">
                {contentFieldLabel}
              </label>
              <span className="creator-field-hint">
                {fieldHints[draft.kind]}
              </span>
            </span>
            {showPatchFileTree ? (
              <div className="patch-editor-shell" data-testid="artifact-editor-patch-nav">
                <PatchFileTree
                  key={patchFilePaths.join("::")}
                  paths={patchFilePaths}
                  onSelectPath={handlePatchFileSelect}
                />
                <textarea
                  id="artifact-editor-content"
                  ref={patchTextareaRef}
                  name="content"
                  value={draft.content}
                  onChange={(event) => updateDraft("content", event.target.value)}
                  className="creator-textarea"
                  rows={14}
                  autoFocus
                  data-testid="artifact-editor-content"
                />
              </div>
            ) : (
              <textarea
                id="artifact-editor-content"
                ref={patchTextareaRef}
                name="content"
                value={draft.content}
                onChange={(event) => updateDraft("content", event.target.value)}
                className="creator-textarea"
                rows={14}
                autoFocus
                data-testid="artifact-editor-content"
              />
            )}
          </div>
        )}

        <div className="creator-form-footer creator-field-full">
          <button
            type="submit"
            className="artifact-action is-commit"
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
                  "artifact-action codec-key",
                  (draft.codec ?? "auto") === option && "is-depressed",
                  isDeprecatedEmitCodec(option) && "is-deprecated",
                )}
                aria-pressed={(draft.codec ?? "auto") === option}
                title={
                  isDeprecatedEmitCodec(option)
                    ? "Deprecated: Discord and WhatsApp detonate these Unicode wires. Use auto or arx5."
                    : undefined
                }
                onClick={() => updateDraft("codec", option)}
              >
                {codecPickerLabel(option)}
              </button>
            ))}
          </div>
        </div>
      </form>

      {generatedLink ? (
        <aside
          ref={resultRef}
          className="creator-result-shell carbon-output"
          data-testid="artifact-editor-result"
        >
          <header className="creator-result-head">
            <div>
              <h3>Generated link</h3>
              <p>{generatedLink.artifact.filename ?? generatedLink.artifact.title ?? ""}</p>
            </div>
            <span className="carbon-stamp">TRANSFER OK</span>
          </header>

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

          <dl className="creator-result-metrics">
            <div>
              <dt>Codec</dt>
              <dd>{generatedLink.codec}</dd>
            </div>
            <div>
              <dt>Fragment</dt>
              <dd>{numberFormatter.format(generatedLink.fragmentLength)} chars</dd>
            </div>
          </dl>

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
                copyState === "copied" && "is-confirmed",
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
                markdownLinkCopyState === "copied" && "is-confirmed",
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
              className="artifact-action"
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
