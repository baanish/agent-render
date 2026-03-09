"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, ListTree } from "lucide-react";
import { useTheme } from "next-themes";
import { Mode, createJSONEditor } from "vanilla-jsoneditor";
import type { Content, JSONEditorPropsOptional } from "vanilla-jsoneditor";
import type { JsonArtifact } from "@/lib/payload/schema";
import { CodeRenderer } from "@/components/renderers/code-renderer";

type JsonRendererProps = {
  artifact: JsonArtifact;
};

function JSONEditorHost(props: JSONEditorPropsOptional) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    editorRef.current = createJSONEditor({
      target: containerRef.current,
      props: {},
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    editorRef.current?.updateProps(props);
  }, [props]);

  return <div ref={containerRef} className="json-editor-host" />;
}

export function JsonRenderer({ artifact }: JsonRendererProps) {
  const { resolvedTheme } = useTheme();
  const [view, setView] = useState<"tree" | "raw">("tree");
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, json: JSON.parse(artifact.content) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Invalid JSON payload." };
    }
  }, [artifact.content]);

  const content: Content | undefined = parsed.ok ? { json: parsed.json } : undefined;

  if (!parsed.ok) {
    return (
      <div className="json-renderer-shell">
        <div className="artifact-empty-state">{parsed.message}</div>
        <div className="mt-4">
          <CodeRenderer artifact={{ ...artifact, kind: "code", language: "json" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="json-renderer-shell">
      <div className="json-renderer-toolbar">
        <div className="diff-view-toggle">
          <button type="button" className={`artifact-action ${view === "tree" ? "is-primary" : ""}`} onClick={() => setView("tree")}>
            <ListTree className="h-3.5 w-3.5" />
            Tree
          </button>
          <button type="button" className={`artifact-action ${view === "raw" ? "is-primary" : ""}`} onClick={() => setView("raw")}>
            <Braces className="h-3.5 w-3.5" />
            Raw
          </button>
        </div>
        <span className="mono-pill">read-only</span>
      </div>
      {view === "tree" ? (
        <div className={`json-tree-shell ${resolvedTheme === "dark" ? "jse-theme-dark" : ""}`.trim()}>
          <JSONEditorHost
            content={content}
            readOnly
            mode={Mode.tree}
            mainMenuBar={false}
            navigationBar={false}
            statusBar={false}
          />
        </div>
      ) : (
        <CodeRenderer artifact={{ ...artifact, kind: "code", language: "json" }} />
      )}
    </div>
  );
}
