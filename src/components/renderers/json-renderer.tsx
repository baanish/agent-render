"use client";

import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Braces, ChevronRight, ListTree } from "lucide-react";
import type { JsonArtifact } from "@/lib/payload/schema";

type JsonRendererProps = {
  artifact: JsonArtifact;
  onReady?: () => void;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

// Policy (owned decision): collapse nodes deeper than this to a leaf so a pathological or deeply
// nested payload can never overflow React's client render stack. A MAX_DECODED_PAYLOAD_LENGTH
// (200k char) payload can nest thousands deep in only a few KB, which crashes the reconciler with
// a RangeError; 200 is far beyond any human-readable JSON. Change only by maintainer decision.
const MAX_JSON_TREE_DEPTH = 200;

function JsonNode({ label, value, level = 0 }: { label?: string; value: JsonValue; level?: number }) {
  if (value === null || typeof value !== "object") {
    return (
      <div className="json-leaf-row" style={{ paddingLeft: `${level * 1.1}rem` }}>
        {label ? <span className="json-key">{label}</span> : null}
        <span className={`json-value json-${value === null ? "null" : typeof value}`}>{String(value)}</span>
      </div>
    );
  }

  if (level >= MAX_JSON_TREE_DEPTH) {
    return (
      <div className="json-leaf-row" style={{ paddingLeft: `${level * 1.1}rem` }}>
        {label ? <span className="json-key">{label}</span> : null}
        <span className="json-value json-truncated">
          {Array.isArray(value)
            ? `Array(${value.length}) — max depth reached`
            : `Object(${Object.keys(value).length}) — max depth reached`}
        </span>
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

// Defense-in-depth (mirrors DiffRendererBoundary): if the recursive tree render throws for any
// reason, degrade to the raw source view instead of crashing the whole viewer. The depth cap above
// is the primary guard; this catches anything it doesn't. Keyed by artifact id so a new artifact
// resets the error state and retries the tree.
class JsonTreeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Log the swallowed throw (parity with DiffRendererBoundary) so a future JsonNode regression
    // that slips past the depth cap leaves a trace instead of silently falling back to raw.
    console.error("JSON tree render failed; falling back to raw source view.", error);
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
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
        <JsonTreeBoundary key={artifact.id} fallback={<JsonRawSource content={artifact.content} />}>
          <div className="json-tree-shell">
            <JsonNode value={parsed.json} />
          </div>
        </JsonTreeBoundary>
      ) : (
        <JsonRawSource content={artifact.content} />
      )}
    </div>
  );
}
