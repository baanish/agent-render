"use client";

import { MAX_FRAGMENT_LENGTH, type ParsedPayload } from "@/lib/payload/schema";
import { getHashPreview } from "@/components/viewer/hash-preview";
import { numberFormatter } from "@/lib/format";
import { cn } from "@/lib/utils";

export type InspectorStatusTone = {
  label: string;
  color: string;
  message: string;
};

type InspectorPanelProps = {
  budgetRatio: number;
  codec: string | null;
  artifactCount: number | null;
  fragmentLength: number;
  hash: string;
  parsed: ParsedPayload;
  statusTone: InspectorStatusTone;
};

/**
 * Dark recessed QRH-style card that reports the live URL-fragment decode
 * state: status, budget meter, codec, artifact count, and a hash preview.
 * Rendered by the shell only when a fragment exists; promoted to the top of
 * the page (via placement, not props) when decoding failed.
 */
export function InspectorPanel({
  budgetRatio,
  codec,
  artifactCount,
  fragmentLength,
  hash,
  parsed,
  statusTone,
}: InspectorPanelProps) {
  const isError = !parsed.ok && parsed.code !== "empty";

  return (
    <section
      className={cn(
        "print-hide-on-markdown",
        isError ? "home-error-inspector-section" : "home-inspector-section",
      )}
    >
      <div className="inspector-panel">
        <div className="inspector-panel-head">
          <h3 className="inspector-panel-title">URL state</h3>
          <span className="inspector-panel-status" style={{ color: statusTone.color }}>
            {statusTone.label}
          </span>
        </div>
        <div className="inspector-panel-body">
          {statusTone.message ? (
            <p className="inspector-panel-message">{statusTone.message}</p>
          ) : null}

          <p className="stat-row">
            <span className="stat-item">
              fragment{" "}
              <span className="stat-value">
                {numberFormatter.format(fragmentLength)} / {numberFormatter.format(MAX_FRAGMENT_LENGTH)}
              </span>
            </span>
            <span className="stat-item">
              codec <span className="stat-value">{codec ?? "—"}</span>
            </span>
            <span className="stat-item">
              artifacts{" "}
              <span className="stat-value">
                {artifactCount !== null ? numberFormatter.format(artifactCount) : "0"}
              </span>
            </span>
          </p>

          <div
            className="budget-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(budgetRatio * 100)}
          >
            <span className="budget-fill" style={{ transform: `scaleX(${budgetRatio})` }} />
          </div>

          <pre className="inspector-hash">{getHashPreview(hash)}</pre>
        </div>
      </div>
    </section>
  );
}
