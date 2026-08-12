type OperatingState = "standby" | "ready" | "fail" | "hold";

type StatusFlagProps = {
  state: OperatingState;
  label: string;
};

/**
 * Renders an operating-state flag as a chassis cutout with a lamp well.
 * Accepts a discrete `state` and visible `label` so READY, STANDBY, FAIL, and HOLD stay distinguishable without relying on color alone.
 */
export function StatusFlag({ state, label }: StatusFlagProps) {
  return (
    <span className="status-flag" data-state={state}>
      <span className="status-flag-lamp" aria-hidden="true" />
      <span className="status-flag-label">{label}</span>
    </span>
  );
}
