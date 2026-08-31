type FragmentDetailsDisclosureProps = {
  fragmentLength: string;
  maxLength: string;
  codec: string;
  hashPreview: string;
};

/**
 * Shows protocol diagnostics for the current fragment payload in a collapsible viewer panel.
 * Receives codec, length budget, and hash preview props from the shell-level decode state.
 * Stays read-only and provides quick visibility into transport details.
 */
export function FragmentDetailsDisclosure({
  fragmentLength,
  maxLength,
  codec,
  hashPreview,
}: FragmentDetailsDisclosureProps) {
  return (
    <details className="artifact-disclosure" data-testid="fragment-disclosure" open>
      <summary className="artifact-disclosure-summary">
        <span className="artifact-disclosure-title">Fragment details</span>
      </summary>
      <div className="artifact-disclosure-body">
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
