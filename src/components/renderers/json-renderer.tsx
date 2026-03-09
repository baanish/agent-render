"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Braces, ChevronRight, ListTree } from "lucide-react";
import type { JsonArtifact } from "@/lib/payload/schema";

type JsonRendererProps = {
  artifact: JsonArtifact;
  onReady?: () => void;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const EmbeddedCodeRenderer = dynamic(
  () => import("@/components/renderers/code-renderer").then((module) => module.CodeRenderer),
  { ssr: false },
);

function JsonNode({ label, value, level = 0 }: { label?: string; value: JsonValue; level?: number }) {
  if (value === null || typeof value !== "object") {
    return (
      <div className="json-leaf-row" style={{ paddingLeft: `${level * 1.1}rem` }}>
        {label ? <span className="json-key">{label}</span> : null}
        <span className={`json-value json-${value === null ? "null" : typeof value}`}>{String(value)}</span>
      </div>
    );
  }

  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);
  const summary = Array.isArray(value) ? `Array(${entries.length})` : `Object(${entries.length})`;

  return (
    <details className="json-node" open>
      <summary className="json-summary" style={{ paddingLeft: `${level * 1.1}rem` }}>
        <ChevronRight className="json-summary-icon h-3.5 w-3.5" />
        {label ? <span className="json-key">{label}</span> : null}
        <span className="json-structure">{summary}</span>
      </summary>
      <div className="json-children">
        {entries.map(([entryLabel, entryValue]) => (
          <JsonNode key={`${label ?? "root"}-${entryLabel}`} label={entryLabel} value={entryValue} level={level + 1} />
        ))}
      </div>
    </details>
  );
}

export function JsonRenderer({ artifact, onReady }: JsonRendererProps) {
  const [view, setView] = useState<"tree" | "raw">("tree");
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, json: JSON.parse(artifact.content) as JsonValue };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Invalid JSON payload." };
    }
  }, [artifact.content]);

  useEffect(() => {
    onReady?.();
  }, [artifact.id, onReady, parsed.ok, view]);

  if (!parsed.ok) {
    return (
      <div className="json-renderer-shell" data-testid="renderer-json" data-renderer-ready="true">
        <div className="artifact-empty-state">{parsed.message}</div>
        <div className="mt-4">
          <EmbeddedCodeRenderer compact artifact={{ ...artifact, kind: "code", language: "json" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="json-renderer-shell" data-testid="renderer-json" data-renderer-ready="true">
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
        <div className="json-tree-shell">
          <JsonNode value={parsed.json} />
        </div>
      ) : (
        <EmbeddedCodeRenderer compact artifact={{ ...artifact, kind: "code", language: "json" }} />
      )}
    </div>
  );
}
