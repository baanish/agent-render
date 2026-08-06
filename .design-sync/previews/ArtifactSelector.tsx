import { useEffect, useRef } from "react";
import { ArtifactSelector, sampleEnvelopes } from "agent-render";
import { FileCode2, FileDiff, FileJson2, FileSpreadsheet, FileText } from "lucide-react";

/** Scrolls the strip to its active tab after mount, as the browser would on tab switch. */
const ScrolledToActive = ({ children }: { children?: unknown }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current?.querySelector(".artifact-selector-row");
    const active = strip?.querySelector<HTMLElement>(".is-active");
    if (strip && active) strip.scrollLeft = active.offsetLeft;
  }, []);
  return <div ref={ref}>{children as never}</div>;
};

// Mirrors src/components/artifact-kind-icons.ts and the heading/label helpers
// that ArtifactStage passes at the real call site (src/components/viewer/artifact-stage.tsx).
const kindIcons = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};

type SelectorArtifact = { id: string; kind: string; title?: string; filename?: string };

const getHeading = (artifact: SelectorArtifact) =>
  artifact.title ?? artifact.filename ?? artifact.id;
const getSupportingLabel = (artifact: SelectorArtifact) =>
  artifact.filename && artifact.filename !== getHeading(artifact)
    ? artifact.filename
    : artifact.id;

const showcase = sampleEnvelopes[4];
const noop = () => {};

/** Full five-kind bundle (arx showcase): markdown, code, diff, csv, json tabs with the markdown active. */
export const FiveArtifactShowcase = () => (
  <ArtifactSelector
    artifacts={showcase.artifacts}
    activeArtifactId="release-notes"
    kindIcons={kindIcons}
    getHeading={getHeading}
    getSupportingLabel={getSupportingLabel}
    onSelect={noop}
  />
);

/** Same bundle scrolled to the active diff tab, with the csv and json tabs in view. */
export const DiffTabActive = () => (
  <ScrolledToActive>
    <ArtifactSelector
      artifacts={showcase.artifacts}
      activeArtifactId="migration-diff"
      kindIcons={kindIcons}
      getHeading={getHeading}
      getSupportingLabel={getSupportingLabel}
      onSelect={noop}
    />
  </ScrolledToActive>
);

/** Minimal two-artifact bundle: a roadmap doc plus its release patch. */
export const TwoArtifactBundle = () => (
  <ArtifactSelector
    artifacts={[sampleEnvelopes[0].artifacts[0], sampleEnvelopes[2].artifacts[0]]}
    activeArtifactId="patch"
    kindIcons={kindIcons}
    getHeading={getHeading}
    getSupportingLabel={getSupportingLabel}
    onSelect={noop}
  />
);
