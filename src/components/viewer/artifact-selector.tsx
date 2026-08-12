import type { ArtifactPayload } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type ArtifactSelectorProps = {
  artifacts: ArtifactPayload[];
  activeArtifactId: string;
  onSelect: (artifactId: string) => void;
  getHeading: (artifact: ArtifactPayload) => string;
  getSupportingLabel: (artifact: ArtifactPayload) => string;
};

/**
 * Renders artifact keys in the viewer so operators can switch within a decoded bundle.
 * Uses `artifacts`, `activeArtifactId`, and `onSelect` to drive selection, plus heading/label formatters.
 * Filename is the visible identity; kind stays secondary metadata.
 */
export function ArtifactSelector({
  artifacts,
  activeArtifactId,
  onSelect,
  getHeading,
  getSupportingLabel,
}: ArtifactSelectorProps) {
  return (
    <div className="artifact-selector-row" data-testid="artifact-selector-row">
      {artifacts.map((artifact) => {
        const heading = getHeading(artifact);
        const supportingLabel = getSupportingLabel(artifact);
        const isCurrent = artifact.id === activeArtifactId;
        const filename = artifact.filename?.trim() || heading;

        return (
          <button
            key={artifact.id}
            type="button"
            className={cn("artifact-switcher", isCurrent && "is-active")}
            onClick={() => onSelect(artifact.id)}
            aria-pressed={isCurrent}
            aria-label={`Open artifact ${heading}`}
          >
            <span className="artifact-switcher-content min-w-0 flex-1 text-left">
              <span className="artifact-switcher-title">{filename}</span>
              <span className="artifact-switcher-meta">
                <span>{artifact.kind}</span>
                {supportingLabel !== filename ? (
                  <span className="truncate">{supportingLabel}</span>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
