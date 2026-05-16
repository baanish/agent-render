"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Braces, ChevronRight, ListTree } from "lucide-react";
import type { JsonArtifact } from "@/lib/payload/schema";

type JsonRendererProps = {
  artifact: JsonArtifact;
  onReady?: () => void;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function JsonNode({ label, value, level = 0 }: { label?: string; value: JsonValue; level?: number }) {
  if (value === null || typeof value !== "object") {
    return (
      <div className="json-leaf-row" style={{ paddingLeft: `${level * 1.1}rem` }}>
        {label ? <span className="json-key">{label}</span> : null}
        <span className={`json-value json-${value === null ? "null" : typeof value}`}>{String(value)}</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <details className="json-node" open>
        <summary className="json-summary" style={{ paddingLeft: `${level * 1.1}rem` }}>
          <ChevronRight className="json-summary-icon h-3.5 w-3.5" />
          {label ? <span className="json-key">{label}</span> : null}
          <span className="json-structure">{`Array(${value.length})`}</span>
        </summary>
        <div className="json-children">
          {value.map((entryValue, index) => (
            <JsonNode key={`${label ?? "root"}-${index}`} label={String(index)} value={entryValue} level={level + 1} />
          ))}
        </div>
      </details>
    );
  }

  const keys = Object.keys(value);
  const summary = `Object(${keys.length})`;

  return (
    <details className="json-node" open>
      <summary className="json-summary" style={{ paddingLeft: `${level * 1.1}rem` }}>
        <ChevronRight className="json-summary-icon h-3.5 w-3.5" />
        {label ? <span className="json-key">{label}</span> : null}
        <span className="json-structure">{summary}</span>
      </summary>
      <div className="json-children">
        {keys.map((entryLabel) => (
          <JsonNode key={`${label ?? "root"}-${entryLabel}`} label={entryLabel} value={value[entryLabel]} level={level + 1} />
        ))}
      </div>
    </details>
  );
}

function JsonRawSource({ content }: { content: string }) {
  return (
    <pre className="json-raw-source" data-testid="renderer-json-raw">
      <code>{content}</code>
    </pre>
  );
}

/**
 * Shows JSON artifacts with a toggle between structured tree and native raw source views.
 * Receives `artifact` and optional `onReady`, including readiness updates across parse and view-mode changes.
 * Falls back to a native raw source block with an error notice when JSON parsing fails.
 */
export function JsonRenderer({ artifact, onReady }: JsonRendererProps) {
  const onReadyRef = useRef(onReady);
  const [view, setView] = useState<"tree" | "raw">("tree");
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, json: JSON.parse(artifact.content) as JsonValue };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Invalid JSON payload." };
    }
  }, [artifact.content]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current?.();
  }, [artifact.id, parsed.ok, view]);

  if (!parsed.ok) {
    return (
      <div className="json-renderer-shell" data-testid="renderer-json" data-renderer-ready="true">
        <div className="artifact-empty-state">{parsed.message}</div>
        <JsonRawSource content={artifact.content} />
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
        <JsonRawSource content={artifact.content} />
      )}
    </div>
  );
}
