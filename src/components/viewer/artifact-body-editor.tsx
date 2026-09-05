"use client";

import { useMemo, useRef, type Ref } from "react";
import { useResolvedTheme } from "@/components/theme/use-theme-controller";
import {
  CodeView,
  EditProvider,
  Editor,
  type CodeViewHandle,
  type CodeViewItem,
} from "@/lib/diff/pierre-edit";

export type ArtifactBodyDocument = {
  id: string;
  name: string;
  contents: string;
};

type ArtifactBodyEditorProps = {
  documents: readonly ArtifactBodyDocument[];
  onDocumentChange: (id: string, contents: string) => void;
  codeViewRef?: Ref<CodeViewHandle<undefined>>;
};

/**
 * Editable document surface for the artifact editor: each document mounts as a CodeView file
 * item in edit mode, so editing happens on the same syntax-highlighted Pierre surface as the
 * viewer instead of a plain textarea. The edit runtime (`@pierre/diffs/edit`) only loads with
 * this module, which the artifact editor imports dynamically.
 *
 * Callers remount this component (via `key`) when the edited artifact switches; document changes
 * flow out through `onDocumentChange` so the owning draft stays the source of truth.
 */
export function ArtifactBodyEditor({
  documents,
  onDocumentChange,
  codeViewRef,
}: ArtifactBodyEditorProps) {
  const onChangeRef = useRef(onDocumentChange);
  onChangeRef.current = onDocumentChange;
  const initialItems = useMemo<readonly CodeViewItem[]>(
    () =>
      documents.map((doc) => ({
        id: doc.id,
        type: "file",
        file: { name: doc.name, contents: doc.contents, cacheKey: doc.id },
        edit: true,
      })),
    [documents],
  );
  const resolvedTheme = useResolvedTheme();
  const codeViewOptions = useMemo(
    () => ({ theme: "agent-render", themeType: resolvedTheme }),
    [resolvedTheme],
  );

  return (
    <EditProvider createEditor={(options) => new Editor(options)}>
      <CodeView
        ref={codeViewRef}
        className="artifact-body-editor"
        initialItems={initialItems}
        options={codeViewOptions}
        disableWorkerPool
        onItemEditChange={(item, file) => {
          onChangeRef.current(item.id, file.contents);
        }}
      />
    </EditProvider>
  );
}
