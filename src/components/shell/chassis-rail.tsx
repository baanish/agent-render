import { StatusFlag, type OperatingState } from "@/components/shell/status-flag";
import { numberFormatter } from "@/lib/format";
import { MAX_FRAGMENT_LENGTH } from "@/lib/payload/schema";

type ChassisRailProps = {
  state: OperatingState;
  statusLabel: string;
  fragmentLength: number;
  codec: string;
  artifactCount?: number;
};

/**
 * Renders the always-on limits strip: operating state, fragment budget, codec, and artifact count.
 * Keeps those values in the chassis so operators can read confidence and limits without opening a supplementary panel.
 */
export function ChassisRail({
  state,
  statusLabel,
  fragmentLength,
  codec,
  artifactCount,
}: ChassisRailProps) {
  const budgetRatio = Math.min(fragmentLength / MAX_FRAGMENT_LENGTH, 1);

  return (
    <div className="chassis-rail print-hide-on-markdown">
      <StatusFlag state={state} label={statusLabel} />
      <div className="limit-cell">
        <span className="field-label">Frag</span>
        <span className="limit-value">
          {numberFormatter.format(fragmentLength)} /{" "}
          {numberFormatter.format(MAX_FRAGMENT_LENGTH)}
        </span>
        <div className="budget-track" aria-hidden="true">
          <div className="budget-fill" style={{ width: `${budgetRatio * 100}%` }} />
        </div>
      </div>
      <div className="limit-cell">
        <span className="field-label">Codec</span>
        <span className="limit-value">{codec}</span>
      </div>
      {typeof artifactCount === "number" ? (
        <div className="limit-cell">
          <span className="field-label">Artifacts</span>
          <span className="limit-value">{numberFormatter.format(artifactCount)}</span>
        </div>
      ) : null}
    </div>
  );
}
