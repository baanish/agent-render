type FragmentDetailsDisclosureProps = {
  statusLabel: string;
  statusMessage: string;
  fragmentLength: string;
  maxLength: string;
  codec: string;
  hashPreview: string;
};

/**
 * Shows protocol diagnostics for the current fragment payload in a collapsible chassis bay.
 * Receives status, codec, length budget, and hash preview props from the shell-level decode state.
 * Stays read-only and provides quick visibility into transport/fallback conditions.
 */
export function FragmentDetailsDisclosure({
  statusLabel,
  statusMessage,
  fragmentLength,
  maxLength,
  codec,
  hashPreview,
}: FragmentDetailsDisclosureProps) {
  return (
    <details className="artifact-disclosure" data-testid="fragment-disclosure">
      <summary className="artifact-disclosure-summary">
        <span className="artifact-disclosure-summary-copy">
          <span className="artifact-disclosure-title text-sm font-medium text-[color:var(--text-primary)]">
            Diagnostics
          </span>
        </span>
      </summary>
      <div className="artifact-disclosure-body">
        <p className="artifact-disclosure-status text-sm leading-6 text-[color:var(--text-muted)]">{statusMessage}</p>
        <div className="artifact-disclosure-grid">
          <div className="metric-card">
            <p className="field-label">State</p>
            <p className="metric-value">{statusLabel}</p>
          </div>
          <div className="metric-card">
            <p className="field-label">Budget</p>
            <p className="metric-value">{fragmentLength} / {maxLength}</p>
          </div>
          <div className="metric-card">
            <p className="field-label">Codec</p>
            <p className="metric-value">{codec}</p>
          </div>
          <div className="metric-card">
            <p className="field-label">Path</p>
            <p className="metric-value">Fragment</p>
          </div>
        </div>
        <div className="artifact-hash-preview">
          <p className="field-label">Hash</p>
          <pre className="artifact-hash-preview-code font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)]">
            {hashPreview}
          </pre>
        </div>
      </div>
    </details>
  );
}
