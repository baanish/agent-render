import React from "react";
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

/** Public API for `ArtifactSelector`. */
export function ArtifactSelector({
  artifacts,
  activeArtifactId,
  onSelect,
  kindIcons,
  getHeading,
  getSupportingLabel,
}: ArtifactSelectorProps) {
  return (
    <div className="artifact-selector-row" data-testid="artifact-selector-row">
      {artifacts.map((artifact) => {
        const Icon = kindIcons[artifact.kind];
        const isCurrent = artifact.id === activeArtifactId;

        return (
          <button
            key={artifact.id}
            type="button"
            className={cn("artifact-switcher", isCurrent && "is-active")}
            onClick={() => onSelect(artifact.id)}
            aria-pressed={isCurrent}
            aria-label={`Open artifact ${getHeading(artifact)}`}
          >
            <span className="artifact-switcher-icon">
              <Icon className="h-4 w-4" />
            </span>
            <span className="artifact-switcher-content min-w-0 flex-1 text-left">
              <span className="artifact-switcher-title block truncate text-sm font-semibold leading-5">{getHeading(artifact)}</span>
              <span className="artifact-switcher-meta mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[color:var(--text-muted)]">
                <span className="section-kicker !text-[0.64rem] !tracking-[0.1em]">{artifact.kind}</span>
                <span className="truncate">{getSupportingLabel(artifact)}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
