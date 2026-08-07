import type { LucideIcon } from "lucide-react";
import type { ArtifactKind, ArtifactPayload } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type ArtifactSelectorProps = {
  artifacts: ArtifactPayload[];
  activeArtifactId: string;
  onSelect: (artifactId: string) => void;
  kindIcons: Record<ArtifactKind, LucideIcon>;
  getHeading: (artifact: ArtifactPayload) => string;
  getSupportingLabel: (artifact: ArtifactPayload) => string;
};

/**
 * Horizontal keycap strip for switching artifacts inside a decoded bundle.
 * Only mounted by the stage when the envelope carries more than one artifact;
 * each chip shows kind icon, heading, and a mono meta line.
 */
export function ArtifactSelector({
  artifacts,
  activeArtifactId,
  onSelect,
  kindIcons,
  getHeading,
  getSupportingLabel,
}: ArtifactSelectorProps) {
  return (
    <div
      className="artifact-selector-row bench-board"
      data-testid="artifact-selector-row"
    >
      {artifacts.map((artifact) => {
        const Icon = kindIcons[artifact.kind];
        const heading = getHeading(artifact);
        const supportingLabel = getSupportingLabel(artifact);
        const isCurrent = artifact.id === activeArtifactId;

        return (
          <button
            key={artifact.id}
            type="button"
            className={cn("bench-cell", "artifact-switcher", isCurrent && "is-active")}
            onClick={() => onSelect(artifact.id)}
            aria-pressed={isCurrent}
            aria-label={`Open artifact ${heading}`}
          >
            <span className="artifact-switcher-icon">
              <Icon className="h-4 w-4" />
            </span>
            <span className="artifact-switcher-content">
              <span className="artifact-switcher-title">{heading}</span>
              <span className="artifact-switcher-meta">
                <span>{artifact.kind}</span>
                <span className="truncate">{supportingLabel}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
