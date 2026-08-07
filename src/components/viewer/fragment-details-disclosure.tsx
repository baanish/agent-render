type FragmentDetailsDisclosureProps = {
  statusLabel: string;
  statusMessage: string;
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
  statusMessage,
  fragmentLength,
  maxLength,
  codec,
  hashPreview,
}: FragmentDetailsDisclosureProps) {
  const statusColor = statusLabel === "FAULT" ? "var(--alert)" : "var(--confirmation)";

  return (
    <details className="artifact-disclosure" data-testid="fragment-disclosure" open>
      <summary className="artifact-disclosure-summary">
        <span className="artifact-disclosure-summary-copy">
          <span className="artifact-disclosure-title">Fragment</span>
          <span className="revision-placard">PROC FRG-01 / LIVE URL</span>
        </span>
        <span className="status-readout" style={{ color: statusColor }}>
          <span className="status-led" style={{ backgroundColor: statusColor }} />
          {statusLabel}
        </span>
      </summary>
      <div className="artifact-disclosure-body">
        <p className="artifact-disclosure-status">{statusMessage}</p>
        <dl className="artifact-disclosure-grid">
          <div>
            <dt>Budget</dt>
            <dd>{fragmentLength} / {maxLength}</dd>
          </div>
          <div>
            <dt>Codec</dt>
            <dd>{codec}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>Fragment only</dd>
          </div>
        </dl>
        <div className="artifact-hash-preview">
          <p className="metric-label">Hash</p>
          <pre className="artifact-hash-preview-code">
            {hashPreview}
          </pre>
        </div>
      </div>
    </details>
  );
}
