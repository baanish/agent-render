type ArtifactFact = { label: string; value: string };

type FragmentDetailsDisclosureProps = {
  statusLabel: string;
  fragmentLength: string;
  maxLength: string;
  codec: string;
  artifactCount: string;
  hashPreview: string;
  artifactFacts: ArtifactFact[];
};

function LedgerRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bench-ledger-row${className ? ` ${className}` : ""}`}>
      <span className="bench-caps">{label}</span>
      <span className="bench-ledger-dots" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * Single spec placard combining the active artifact's facts (kind, title, file,
 * size) with protocol diagnostics (status, budget, codec, hash, count,
 * transport). Renders as one dense two-column dot-leader ledger; the hash
 * collapses to one truncated mono line.
 */
export function FragmentDetailsDisclosure({
  statusLabel,
  fragmentLength,
  maxLength,
  codec,
  artifactCount,
  hashPreview,
  artifactFacts,
}: FragmentDetailsDisclosureProps) {
  const statusLampClass =
    statusLabel === "Error" ? "is-red" : statusLabel === "Ready" ? "" : "is-amber";

  return (
    <details
      className="artifact-disclosure print-hide-on-markdown"
      data-testid="fragment-disclosure"
      open
    >
      <summary className="artifact-disclosure-summary bench-board-head">
        <span className="artifact-disclosure-title">Spec sheet</span>
      </summary>
      <div className="artifact-disclosure-body">
        <div className="artifact-disclosure-grid" data-testid="artifact-metadata-grid">
          {artifactFacts.map((fact) => (
            <LedgerRow key={fact.label} label={fact.label}>
              <span className="artifact-meta-value">{fact.value}</span>
            </LedgerRow>
          ))}
          <LedgerRow label="Status">
            <span className="artifact-meta-value bench-cell-status">
              <span aria-hidden="true" className={`bench-lamp ${statusLampClass}`} />
              {statusLabel}
            </span>
          </LedgerRow>
          <LedgerRow label="Budget">
            <span className="artifact-meta-value bench-readout">
              {fragmentLength} / {maxLength}
            </span>
          </LedgerRow>
          <LedgerRow label="Codec">
            <span className="artifact-meta-value">{codec}</span>
          </LedgerRow>
          <LedgerRow label="Artifacts">
            <span className="artifact-meta-value">{artifactCount}</span>
          </LedgerRow>
          <LedgerRow label="Transport">
            <span className="artifact-meta-value">Fragment only</span>
          </LedgerRow>
          <LedgerRow className="bench-ledger-row-hash" label="Hash">
            <code className="artifact-hash-preview-code" title={hashPreview}>
              {hashPreview}
            </code>
          </LedgerRow>
        </div>
      </div>
    </details>
  );
}
