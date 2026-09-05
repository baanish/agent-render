"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { CODE_LANGUAGE_CHOICES } from "@/lib/code/language";
import { numberFormatter } from "@/lib/format";
import { parseGitPatchBundle, type ParsedPatchFile } from "@/lib/diff/git-patch";
import type { CodeViewHandle, Editor } from "@/lib/diff/pierre-edit";
import type { ArtifactBodyDocument } from "@/components/viewer/artifact-body-editor";
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

// The Trees runtime stays behind its own chunk; the rail only renders when there is more than
// one thing to navigate, so single-artifact edits never pay for it.
const FileTreeNav = dynamic(
  () => import("@/components/file-tree-nav").then((module) => module.FileTreeNav),
  { ssr: false },
);

// The Pierre edit surface (CodeView + EditProvider + Editor) is heavy and only needed while
// editing, so it loads behind its own dynamic boundary inside the already-deferred editor chunk.
const ArtifactBodyEditor = dynamic(
  () =>
    import("@/components/viewer/artifact-body-editor").then(
      (module) => module.ArtifactBodyEditor,
    ),
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

// Snapshots a draft into the documents the Pierre edit surface mounts. Pair diffs become two
// documents with the conventional `a/`/`b/` prefixes so file headers read like a git patch and
// the extension still drives language inference.
function buildBodyDocuments(draft: ArtifactEditDraft): ArtifactBodyDocument[] {
  const name = draft.filename.trim() || "content";
  if (draft.kind === "diff" && draft.diffSource === "pair") {
    return [
      { id: "old", name: `a/${name}`, contents: draft.oldContent ?? "" },
      { id: "new", name: `b/${name}`, contents: draft.newContent ?? "" },
    ];
  }
  return [{ id: "content", name, contents: draft.content }];
}

// Pierre renders the editable element inside nested shadow roots; walk them to find it.
function findContentEditable(root: ParentNode | null): HTMLElement | null {
  if (root == null) {
    return null;
  }

  let match: HTMLElement | null = null;
  for (const child of Array.from(root.children)) {
    if (child.getAttribute("contenteditable") === "true") {
      match = child as HTMLElement;
    }
    match ??= findContentEditable(child);
    if (child instanceof Element && child.shadowRoot) {
      match ??= findContentEditable(child.shadowRoot);
    }
  }
  return match;
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

function getArtifactTreeLabel(artifact: ArtifactPayload) {
  return artifact.filename?.trim() || artifact.title?.trim() || artifact.id;
}

/**
 * In-viewer editor for the currently open artifact.
 *
 * Starts from the decoded artifact, lets the user correct title/body fields, and generates a new
 * fragment link without writing anything back to a server. Preview replaces the current hash so the
 * edited artifact renders immediately. The body edits on a Pierre `CodeView`/`EditProvider` surface
 * (`artifact-body-editor.tsx`); when the envelope has more than one navigable entry a tree rail lets
 * the edit target switch in place without losing per-artifact drafts.
 */
export function ArtifactEditor({
  artifact,
  envelope,
  onPreviewHash,
}: ArtifactEditorProps) {
  const [editingArtifactId, setEditingArtifactId] = useState(artifact.id);
  const [draftState, setDraftState] = useState(() => ({
    drafts: new Map<string, ArtifactEditDraft>(),
    version: 0,
  }));
  const editingArtifact =
    envelope.artifacts.find((entry) => entry.id === editingArtifactId) ?? artifact;
  const draft =
    draftState.drafts.get(editingArtifactId) ?? createArtifactEditDraft(editingArtifact);
  const draftVersion = draftState.version;
  // The Pierre edit surface owns the document after mount and reports every change through
  // onDocumentChange, so documents only re-snapshot when the edit target switches.
  const [bodyDocuments, setBodyDocuments] = useState<readonly ArtifactBodyDocument[]>(() =>
    buildBodyDocuments(draft),
  );
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
  const bodyEditorRef = useRef<CodeViewHandle<undefined> | null>(null);
  const bodyEditorFrameRef = useRef<HTMLDivElement | null>(null);
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

  // The picker keeps an opened artifact's out-of-list language selectable instead of
  // silently clearing it, since payloads can carry any language hint.
  const languageChoices = useMemo(() => {
    if (!draft.language || CODE_LANGUAGE_CHOICES.some((choice) => choice.value === draft.language)) {
      return CODE_LANGUAGE_CHOICES;
    }
    return [...CODE_LANGUAGE_CHOICES, { value: draft.language, label: draft.language }];
  }, [draft.language]);

  const artifactLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const used = new Set<string>();
    for (const entry of envelope.artifacts) {
      const base = getArtifactTreeLabel(entry);
      let label = base;
      let suffix = 2;
      while (used.has(label)) {
        label = `${base} (${suffix})`;
        suffix += 1;
      }
      used.add(label);
      labels.set(entry.id, label);
    }
    return labels;
  }, [envelope.artifacts]);
  const artifactIdByLabel = useMemo(
    () => new Map(Array.from(artifactLabels, ([id, label]) => [label, id])),
    [artifactLabels],
  );
  // The rail lists every artifact in the envelope; a multi-file patch being edited also lists its
  // files so tree selection can move the patch caret without leaving the editor. A single row
  // (one artifact, nothing nested) is just noise, so the rail hides then.
  const treePaths = useMemo(
    () => [...artifactLabels.values(), ...(patchFiles.length > 1 ? patchFilePaths : [])],
    [artifactLabels, patchFiles.length, patchFilePaths],
  );
  const showTreeRail = treePaths.length > 1;
  const selectedTreePath = artifactLabels.get(editingArtifactId);

  const handlePatchFileSelect = (path: string) => {
    const file = patchFileByPath.get(path);
    const codeView = bodyEditorRef.current;
    if (!file || !codeView) {
      return;
    }

    const offset = patchFileOffsets.get(file.id) ?? 0;
    const lineNumber = draft.content.slice(0, offset).split("\n").length;

    codeView.scrollTo({ type: "line", id: "content", lineNumber, align: "center" });
    // The editor object is our own `Editor` instance; the public DiffsEditor interface hides
    // the selection APIs. `Editor.focus` does not reliably reach the contenteditable inside
    // Pierre's shadow DOM, so focus the editable element directly after placing the caret.
    const editor = codeView.getEditor("content") as Editor<undefined> | undefined;
    const position = { line: lineNumber - 1, character: 0 };
    editor?.setSelections([{ start: position, end: position, direction: "none" }]);
    // The tree's own click handling re-focuses the pressed row after this callback returns,
    // so the editable focus has to wait for the click dispatch to finish.
    window.setTimeout(() => {
      findContentEditable(bodyEditorFrameRef.current)?.focus({ preventScroll: true });
    }, 0);
  };

  const handleTreeSelect = (path: string) => {
    if (patchFileByPath.has(path)) {
      handlePatchFileSelect(path);
      return;
    }

    const targetId = artifactIdByLabel.get(path);
    if (!targetId || targetId === editingArtifactId) {
      return;
    }

    const target = envelope.artifacts.find((entry) => entry.id === targetId);
    if (!target) {
      return;
    }

    setEditingArtifactId(targetId);
    setBodyDocuments(
      buildBodyDocuments(draftState.drafts.get(targetId) ?? createArtifactEditDraft(target)),
    );
  };

  const handleBodyDocumentChange = (id: string, contents: string) => {
    updateDraft(id === "old" ? "oldContent" : id === "new" ? "newContent" : "content", contents);
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
      const base =
        current.drafts.get(editingArtifactId) ?? createArtifactEditDraft(editingArtifact);
      if (Object.is(base[field], value)) {
        return current;
      }

      const drafts = new Map(current.drafts);
      drafts.set(editingArtifactId, { ...base, [field]: value });
      return { drafts, version: current.version + 1 };
    });
  };

  const handleGenerate = async () => {
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;
    setIsGenerating(true);

    try {
      // Apply every edited artifact, then the active one last so the generated
      // link opens on the artifact currently on screen.
      let nextEnvelope = envelope;
      for (const [artifactId, editedDraft] of draftState.drafts) {
        if (artifactId !== editingArtifactId) {
          nextEnvelope = applyArtifactEditDraft(nextEnvelope, editedDraft);
        }
      }
      nextEnvelope = applyArtifactEditDraft(nextEnvelope, draft);

      const nextGeneratedLink = await createGeneratedEnvelopeLinkAsync(
        nextEnvelope,
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
      <div
        className={cn("artifact-editor-frame", !showTreeRail && "is-single")}
        data-testid="artifact-editor-frame"
      >
        {showTreeRail ? (
          <FileTreeNav
            key={treePaths.join("::")}
            paths={treePaths}
            selectedPath={selectedTreePath}
            ariaLabel="Editable files"
            onSelectPath={handleTreeSelect}
          />
        ) : null}
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
            <select
              name="language"
              value={draft.language}
              onChange={(event) => updateDraft("language", event.target.value)}
              className="creator-input"
            >
              {languageChoices.map((choice) => (
                <option key={choice.value || "auto"} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
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

        <div className="creator-field creator-field-full">
          <span className="creator-field-head">
            <span className="metric-label">
              {usesPairDiff ? "Old and new content" : contentFieldLabel}
            </span>
            <span className="creator-field-hint">
              {fieldHints[draft.kind]}
            </span>
          </span>
          <div
            ref={bodyEditorFrameRef}
            className="artifact-body-editor-frame"
            data-testid="artifact-editor-body"
          >
            <ArtifactBodyEditor
              key={editingArtifactId}
              documents={bodyDocuments}
              onDocumentChange={handleBodyDocumentChange}
              codeViewRef={bodyEditorRef}
            />
          </div>
        </div>

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
      </div>

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
