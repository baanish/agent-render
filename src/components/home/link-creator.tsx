"use client";

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { Link2, Upload } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { CODE_LANGUAGE_CHOICES } from "@/lib/code/language";
import { CodecPicker, GeneratedLinkResult } from "@/components/generated-link";
import type {
  GeneratedArtifactLink,
  LinkCreatorDraft,
} from "@/lib/payload/link-creator";
import {
  assertReadableLocalArtifactFile,
  createDraftFromLocalFile,
  LOCAL_ARTIFACT_FILE_ACCEPT,
} from "@/lib/payload/local-file";
import { artifactKinds, type ArtifactKind } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type LinkCreatorProps = {
  onPreviewHash: (hash: string) => void;
};

const fieldHints: Record<ArtifactKind, string> = {
  markdown: "Paste notes or load a local markdown file.",
  code: "Paste a snippet or load a local source file.",
  diff: "Paste a unified git patch or load a .diff / .patch file.",
  csv: "Paste rows or load a local CSV file.",
  json: "Paste JSON or load a local .json file.",
};

const fieldPlaceholders: Record<ArtifactKind, string> = {
  markdown: "# Notes\n\nPaste markdown here.",
  code: 'export function hello() {\n  return "world";\n}',
  diff: 'diff --git a/src/example.ts b/src/example.ts\nindex 1111111..2222222 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-export const value = "old";\n+export const value = "new";\n',
  csv: "name,status\nviewer,ready\ncreator,draft",
  json: '{\n  "status": "ready",\n  "artifacts": 1\n}',
};

const defaultLinkCreatorDraft: LinkCreatorDraft = {
  kind: "markdown",
  title: "Product brief",
  filename: "brief.md",
  content:
    "# Launch note\n\nShare one artifact at a time without uploading it anywhere.\n\n- Markdown stays readable\n- Code keeps its language hint\n- The link works from a static export",
  language: "tsx",
  diffView: "unified",
  codec: "auto",
};

function getBaseUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

function getBodyFieldLabel(kind: ArtifactKind) {
  return kind === "diff" ? "Patch" : "Content";
}

/**
 * Builds shareable fragment links from pasted or locally loaded artifact content
 * in the home empty state flow. File selection is read in the browser only.
 * Accepts `onPreviewHash` so the parent shell can preview the generated fragment before navigation.
 * Generates links client-side with validation, and exposes inline copy/error/stale-result states.
 */
export function LinkCreator({ onPreviewHash }: LinkCreatorProps) {
  const [{ draft, version: draftVersion }, setDraftState] = useState({
    draft: defaultLinkCreatorDraft,
    version: 0,
  });
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
  const generationRequestRef = useRef(0);
  const markdownCopyTokenRef = useRef(0);
  const generatedLinkRef = useRef<GeneratedArtifactLink | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepthRef = useRef(0);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const isGeneratedLinkStale =
    Boolean(generatedLink) && draftVersion !== generatedVersion;
  const contentFieldLabel = getBodyFieldLabel(draft.kind);

  useLayoutEffect(() => {
    generatedLinkRef.current = generatedLink;
  }, [generatedLink]);

  useEffect(() => {
    setCopyState("idle");
    setMarkdownLinkCopyState("idle");
    setError(null);
  }, [draftVersion]);

  const updateDraft = <K extends keyof LinkCreatorDraft>(
    field: K,
    value: LinkCreatorDraft[K],
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

  const replaceDraft = (nextDraft: LinkCreatorDraft) => {
    setDraftState((current) => {
      if (
        current.draft.kind === nextDraft.kind &&
        current.draft.title === nextDraft.title &&
        current.draft.filename === nextDraft.filename &&
        current.draft.content === nextDraft.content &&
        current.draft.language === nextDraft.language &&
        current.draft.diffView === nextDraft.diffView &&
        current.draft.codec === nextDraft.codec
      ) {
        return current;
      }

      return {
        draft: nextDraft,
        version: current.version + 1,
      };
    });
  };

  const handleLocalFile = async (file: File) => {
    try {
      assertReadableLocalArtifactFile(file);
      const text = await file.text();
      replaceDraft(
        createDraftFromLocalFile(
          {
            name: file.name,
            size: file.size,
            type: file.type,
            text,
          },
          draft,
        ),
      );
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The file could not be read.",
      );
    }
  };

  const resetFileDragState = () => {
    fileDragDepthRef.current = 0;
    setIsFileDragOver(false);
  };

  const handleFileDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    fileDragDepthRef.current += 1;
    setIsFileDragOver(true);
  };

  const handleFileDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleFileDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    fileDragDepthRef.current -= 1;
    if (fileDragDepthRef.current <= 0) {
      resetFileDragState();
    }
  };

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    const file = event.dataTransfer.files.item(0);
    resetFileDragState();
    if (!file) {
      return;
    }

    event.preventDefault();
    void handleLocalFile(file);
  };

  const handleGenerate = async () => {
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;

    try {
      const { createGeneratedArtifactLinkAsync } =
        await import("@/lib/payload/link-creator");
      const nextGeneratedLink = await createGeneratedArtifactLinkAsync(
        draft,
        getBaseUrl(),
      );
      if (generationRequestRef.current !== requestId) {
        return;
      }

      setGeneratedLink(nextGeneratedLink);
      setGeneratedVersion(draftVersion);
      setError(null);
      setCopyState("idle");
      setMarkdownLinkCopyState("idle");
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
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) {
      return;
    }

    try {
      await copyTextToClipboard(generatedLink.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handleCopyMarkdownLink = async () => {
    const link = generatedLinkRef.current;
    if (!link) {
      return;
    }

    const requestToken = ++markdownCopyTokenRef.current;
    const expectedHash = link.hash;

    try {
      await copyTextToClipboard(link.markdownLink);
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLinkRef.current?.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("copied");
    } catch {
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLinkRef.current?.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("failed");
    }
  };

  return (
    <section className="home-generator-section operations-card">
      <header className="operations-heading">
        <h2>Create a link</h2>
      </header>

      <form
        className="creator-form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          handleGenerate();
        }}
      >
        <section className="operation-step">
          <header className="operation-step-head">
            <span className="operation-number">01</span>
            <h3>Format</h3>
          </header>
          <div
            className="creator-kind-grid"
            role="group"
            aria-label="Artifact kind"
          >
            {artifactKinds.map((kind) => {
              const isActive = draft.kind === kind;

              return (
                <button
                  key={kind}
                  type="button"
                  className={cn("creator-kind-card", isActive && "is-active")}
                  aria-pressed={isActive}
                  onClick={() => updateDraft("kind", kind)}
                >
                  <span className="creator-kind-label">{kind}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="operation-step">
          <header className="operation-step-head">
            <span className="operation-number">02</span>
            <h3>Identify</h3>
          </header>
          <div className="creator-identify-grid">
            <label className="creator-field">
              <span className="metric-label">Title</span>
              <input
                name="title"
                value={draft.title}
                onChange={(event) => updateDraft("title", event.target.value)}
                placeholder="Quarterly update"
                className="creator-input"
              />
            </label>

            <label className="creator-field">
              <span className="metric-label">Filename</span>
              <input
                name="filename"
                value={draft.filename}
                onChange={(event) => updateDraft("filename", event.target.value)}
                placeholder="update.md"
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
                  {CODE_LANGUAGE_CHOICES.map((choice) => (
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
                      event.target.value as LinkCreatorDraft["diffView"],
                    )
                  }
                  className="creator-input"
                >
                  <option value="unified">Unified</option>
                  <option value="split">Split</option>
                </select>
              </label>
            ) : null}
          </div>
        </section>

        <section className="operation-step">
          <header className="operation-step-head">
            <span className="operation-number">03</span>
            <h3>Load body</h3>
          </header>
          <div
            className={cn(
              "creator-field creator-field-full",
              isFileDragOver && "is-drop-target",
            )}
            onDragEnter={handleFileDragEnter}
            onDragOver={handleFileDragOver}
            onDragLeave={handleFileDragLeave}
            onDrop={handleFileDrop}
          >
            <span className="creator-field-head">
              <label htmlFor="creator-content" className="metric-label">
                {contentFieldLabel}
              </label>
              <span className="creator-field-hint">{fieldHints[draft.kind]}</span>
            </span>
            <div className="creator-file-row">
              <input
                ref={fileInputRef}
                id="creator-file"
                type="file"
                accept={LOCAL_ARTIFACT_FILE_ACCEPT}
                className="creator-file-input"
                aria-label="Load a local file"
                onChange={(event) => {
                  const file = event.target.files?.item(0);
                  event.target.value = "";
                  if (file) {
                    void handleLocalFile(file);
                  }
                }}
              />
              <button
                type="button"
                className="artifact-action"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                Load file
              </button>
              <span className="creator-file-note">
                Stays in the browser. Nothing is uploaded.
              </span>
            </div>
            <textarea
              id="creator-content"
              name="content"
              value={draft.content}
              onChange={(event) => updateDraft("content", event.target.value)}
              placeholder={fieldPlaceholders[draft.kind]}
              className="creator-textarea"
              rows={12}
            />
          </div>
        </section>

        <section className="operation-step">
          <header className="operation-step-head">
            <span className="operation-number">04</span>
            <h3>Compress</h3>
          </header>
          <CodecPicker
            value={draft.codec}
            onSelect={(option) => updateDraft("codec", option)}
          />
        </section>

        <section className="operation-step">
          <header className="operation-step-head">
            <span className="operation-number">05</span>
            <h3>Generate link</h3>
          </header>
          <div className="operation-commit-row">
            <button type="submit" className="artifact-action is-commit">
              <Link2 className="h-3.5 w-3.5" />
              Generate link
            </button>
          </div>
        </section>
      </form>

      {generatedLink ? (
        <GeneratedLinkResult
          link={generatedLink}
          stale={isGeneratedLinkStale}
          copyState={copyState}
          markdownLinkCopyState={markdownLinkCopyState}
          onCopy={() => {
            void handleCopy();
          }}
          onCopyMarkdownLink={() => {
            void handleCopyMarkdownLink();
          }}
          onPreview={() => onPreviewHash(generatedLink.hash)}
          extendedMetrics
        />
      ) : null}

      {error ? (
        <div className="creator-error-state" role="alert">
          <span>FAULT</span>
          {error}
        </div>
      ) : null}
    </section>
  );
}
