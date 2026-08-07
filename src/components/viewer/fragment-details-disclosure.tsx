type FragmentDetailsDisclosureProps = {
  statusLabel: string;
  fragmentLength: string;
  maxLength: string;
  codec: string;
  hashPreview: string;
};

/**
 * Shows protocol diagnostics for the current fragment payload in a collapsible viewer panel.
 * Receives status, codec, length budget, and hash preview props from the shell-level decode state.
 * Stays read-only and provides quick visibility into transport/fallback conditions.
 */
export function FragmentDetailsDisclosure({
  statusLabel,
  fragmentLength,
  maxLength,
  codec,
  hashPreview,
}: FragmentDetailsDisclosureProps) {
  return (
    <details className="artifact-disclosure" data-testid="fragment-disclosure" open>
      <summary className="artifact-disclosure-summary">
        <span className="artifact-disclosure-summary-copy">
          <span className="section-kicker">Fragment details</span>
          <span className="artifact-disclosure-title">
            Codec, budget, and hash preview
          </span>
        </span>
      </summary>
      <div className="artifact-disclosure-body">
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
            <p className="metric-value">Fragment only</p>
          </div>
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
