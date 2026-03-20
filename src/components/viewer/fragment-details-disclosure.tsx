import React from "react";

type FragmentDetailsDisclosureProps = {
  statusLabel: string;
  statusMessage: string;
  fragmentLength: string;
  maxLength: string;
  codec: string;
  hashPreview: string;
  /** Defaults to fragment transport copy for the static product. */
  transportMode?: "fragment" | "stored";
  /** Optional ISO timestamp shown when `transportMode` is `stored`. */
  expiresAtLabel?: string | null;
};

/**
 * Shows protocol diagnostics for the current payload in a collapsible viewer panel.
 * Receives status, codec, length budget, and hash preview props from the shell-level decode state.
 * Supports both fragment transport and optional server-stored UUID transport via `transportMode`.
 */
export function FragmentDetailsDisclosure({
  statusLabel,
  statusMessage,
  fragmentLength,
  maxLength,
  codec,
  hashPreview,
  transportMode = "fragment",
  expiresAtLabel,
}: FragmentDetailsDisclosureProps) {
  const transportLabel = transportMode === "stored" ? "UUID (server-stored)" : "Fragment only";
  const kicker = transportMode === "stored" ? "Payload details" : "Fragment details";
  const title =
    transportMode === "stored"
      ? "Codec, stored wire length, and payload preview"
      : "Codec, transport, budget, and hash preview";

  return (
    <details className="artifact-disclosure" data-testid="fragment-disclosure" data-transport-mode={transportMode}>
      <summary className="artifact-disclosure-summary">
        <span className="artifact-disclosure-summary-copy">
          <span className="section-kicker">{kicker}</span>
          <span className="artifact-disclosure-title text-sm font-medium text-[color:var(--text-primary)]">{title}</span>
        </span>
      </summary>
      <div className="artifact-disclosure-body">
        <p className="artifact-disclosure-status text-sm leading-6 text-[color:var(--text-muted)]">{statusMessage}</p>
        <div className="artifact-disclosure-grid">
          <div className="metric-card">
            <p className="metric-label">Status</p>
            <p className="metric-value">{statusLabel}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Budget</p>
            <p className="metric-value">{fragmentLength} / {maxLength}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Codec</p>
            <p className="metric-value">{codec}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Transport</p>
            <p className="metric-value">{transportLabel}</p>
          </div>
          {transportMode === "stored" && expiresAtLabel ? (
            <div className="metric-card">
              <p className="metric-label">Expires (UTC)</p>
              <p className="metric-value">{expiresAtLabel}</p>
            </div>
          ) : null}
        </div>
        <div className="artifact-hash-preview">
          <p className="metric-label">Hash preview</p>
          <pre className="artifact-hash-preview-code font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)]">
            {hashPreview}
          </pre>
        </div>
      </div>
    </details>
  );
}
