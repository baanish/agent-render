"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { CODE_LANGUAGE_CHOICES } from "@/lib/code/language";
import { CodecPicker, GeneratedLinkResult } from "@/components/generated-link";
import { getPatchFileLabels, parseRenderablePatchFiles, type ParsedPatchFile } from "@/lib/diff/git-patch";
import { getUniqueLabels } from "@/lib/unique-labels";
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
  type ArtifactKind,
  type ArtifactPayload,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { withBasePath } from "@/lib/site/base-path";
import { cn } from "@/lib/utils";

// The Trees runtime stays behind its own chunk; the rail only renders when there is more than
// one thing to navigate, so single-row editing flows do not load it.
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

const fieldHints: Record<ArtifactKind, string> = {
  markdown: "Edit the markdown, then generate a new shareable link.",
  code: "Edit the snippet and keep the language hint when it helps.",
  diff: "Edit the unified git patch, then generate a new shareable link.",
  csv: "Edit the raw CSV, then generate a new shareable link.",
  json: "Edit the JSON, then generate a new shareable link.",
};

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
  // The patch re-parses on the deferred copy so a keystroke paints before the
  // tree rebuilds; a stale rail while typing beats an input stall.
  const deferredDraftContent = useDeferredValue(draft.content);
  const patchFiles = useMemo(() => {
    if (draft.kind !== "diff" || draft.diffSource !== "patch") {
      return EMPTY_PATCH_FILES;
    }

    try {
      return parseRenderablePatchFiles(deferredDraftContent);
    } catch {
      // The patch mid-edit may be malformed; the tree hides until it parses again.
      return EMPTY_PATCH_FILES;
    }
  }, [draft.kind, draft.diffSource, deferredDraftContent]);
  const patchFileLabels = useMemo(() => getPatchFileLabels(patchFiles), [patchFiles]);
  const patchFilePaths = useMemo(
    () => patchFiles.map((file) => patchFileLabels.get(file.id) ?? file.displayPath),
    [patchFiles, patchFileLabels],
  );
  const patchFileByPath = useMemo(
    () => new Map(patchFiles.map((file) => [patchFileLabels.get(file.id) ?? file.displayPath, file])),
    [patchFiles, patchFileLabels],
  );


  // The picker keeps an opened artifact's out-of-list language selectable instead of
  // silently clearing it, since payloads can carry any language hint.
  const languageChoices = useMemo(() => {
    if (!draft.language || CODE_LANGUAGE_CHOICES.some((choice) => choice.value === draft.language)) {
      return CODE_LANGUAGE_CHOICES;
    }
    return [...CODE_LANGUAGE_CHOICES, { value: draft.language, label: draft.language }];
  }, [draft.language]);

  const artifactLabels = useMemo(
    () =>
      getUniqueLabels(
        envelope.artifacts.map((entry) => ({
          id: entry.id,
          base: getArtifactTreeLabel(entry),
        })),
        // Patch file paths share the tree namespace with artifact labels; reserve them so a
        // filename-shaped artifact label can never shadow a patch row under handleTreeSelect.
        patchFiles.length > 1 ? new Set(patchFilePaths) : undefined,
      ),
    [envelope.artifacts, patchFiles.length, patchFilePaths],
  );
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

    const lineNumber = file.startLine;

    codeView.scrollTo({ type: "line", id: "content", lineNumber, align: "center" });
    // CodeView exposes the editor as the narrow DiffsEditor interface, but this surface creates
    // Pierre's concrete Editor. Use its selection and focus APIs instead of walking shadow DOM.
    const editor = codeView.getEditor("content") as Editor<undefined> | undefined;
    if (!editor) {
      return;
    }
    const position = { line: lineNumber - 1, character: 0 };
    editor.setSelections([{ start: position, end: position, direction: "none" }]);
    // The tree row takes focus when its click finishes, so restore editor focus on the next task.
    window.setTimeout(() => {
      editor.focus({ preventScroll: true, lineNumber, character: 0 });
    }, 0);
  };

  const handleTreeSelect = (path: string) => {
    // Patch rows only exist in the rail when the patch has more than one file; the
    // lookup is gated the same way so a hidden single-file row cannot shadow an
    // artifact label that shares its path.
    if (patchFiles.length > 1 && patchFileByPath.has(path)) {
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

    generationRequestRef.current += 1;
    copyTokenRef.current += 1;
    markdownCopyTokenRef.current += 1;
    setEditingArtifactId(targetId);
    setIsGenerating(false);
    setCopyState("idle");
    setMarkdownLinkCopyState("idle");
    setError(null);
    // A link generated for the previous artifact does not describe this one; drop it
    // so Copy/Preview cannot hand out the wrong link while the other draft is open.
    setGeneratedLink(null);
    setGeneratedVersion(-1);
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

  // CodeView treats item.version as the controlled-update boundary. Bump it when a filename
  // changes, and publish the current draft contents with the rename so the controlled item
  // cannot restore the snapshot from before the user started typing.
  useEffect(() => {
    const codeView = bodyEditorRef.current;
    if (!codeView) {
      return;
    }
    for (const document of buildBodyDocuments(draft)) {
      const item = codeView.getItem(document.id);
      if (item?.type === "file" && item.file.name !== document.name) {
        codeView.updateItem({
          ...item,
          version: (item.version ?? 0) + 1,
          file: { ...item.file, name: document.name, contents: document.contents },
        });
      }
    }
  }, [draft]);

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
          try {
            nextEnvelope = applyArtifactEditDraft(nextEnvelope, editedDraft);
          } catch (applyError) {
            const source = envelope.artifacts.find((entry) => entry.id === artifactId);
            const label = source ? getArtifactTreeLabel(source) : artifactId;
            throw new Error(
              `${label}: ${applyError instanceof Error ? applyError.message : String(applyError)}`,
            );
          }
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

    try {
      await copyTextToClipboard(generatedLink.url);
      if (copyTokenRef.current !== requestToken) {
        return;
      }
      setCopyState("copied");
    } catch {
      if (copyTokenRef.current !== requestToken) {
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

    try {
      await copyTextToClipboard(generatedLink.markdownLink);
      if (markdownCopyTokenRef.current !== requestToken) {
        return;
      }
      setMarkdownLinkCopyState("copied");
    } catch {
      if (markdownCopyTokenRef.current !== requestToken) {
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
            // useFileTree fixes its path set at mount. The wrapper synchronizes selection
            // in place, so artifact switches preserve search and scroll state.
            key={JSON.stringify(treePaths)}
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
              {usesPairDiff
                ? "Edit the old and new content, then generate a new shareable link."
                : fieldHints[draft.kind]}
            </span>
          </span>
          <div
            className="artifact-body-editor-frame"
            data-testid="artifact-editor-body"
          >
            <ArtifactBodyEditor
              key={editingArtifactId}
              documents={buildBodyDocuments(draft)}
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
          <CodecPicker
            value={draft.codec}
            label="Compression"
            onSelect={(option) => updateDraft("codec", option)}
          />
        </div>
        </form>
      </div>

      {generatedLink ? (
        <GeneratedLinkResult
          as="aside"
          containerRef={resultRef}
          testId="artifact-editor-result"
          link={generatedLink}
          stale={isGeneratedLinkStale}
          disableActionsWhenStale
          copyState={copyState}
          markdownLinkCopyState={markdownLinkCopyState}
          onCopy={() => {
            void handleCopy();
          }}
          onCopyMarkdownLink={() => {
            void handleCopyMarkdownLink();
          }}
          onPreview={handlePreview}
        />
      ) : null}

      {error ? (
        <div className="creator-error-state" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
