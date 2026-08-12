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
        <span className="artifact-disclosure-title">Diagnostics</span>
      </summary>
      <div className="artifact-disclosure-body">
        {statusMessage ? (
          <p className="artifact-disclosure-status">{statusMessage}</p>
        ) : null}
        <div className="artifact-disclosure-grid">
          <div className="inspector-cell">
            <p className="field-label">State</p>
            <p className="metric-value">{statusLabel}</p>
          </div>
          <div className="inspector-cell">
            <p className="field-label">Budget</p>
            <p className="metric-value">
              {fragmentLength} / {maxLength}
            </p>
          </div>
          <div className="inspector-cell">
            <p className="field-label">Codec</p>
            <p className="metric-value">{codec}</p>
          </div>
        </div>
        <div className="artifact-hash-preview">
          <p className="field-label">Hash</p>
          <pre className="artifact-hash-preview-code">{hashPreview}</pre>
        </div>
      </div>
    </details>
  );
}
