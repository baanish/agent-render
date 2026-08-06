import { DiffRenderer, sampleEnvelopes } from "agent-render";

const releasePatch = sampleEnvelopes[2].artifacts[0];
const migrationDiff = sampleEnvelopes[4].artifacts[2];

/** Canonical: multi-file git patch in split view (edit + new file). */
export const SplitMultiFilePatch = () => <DiffRenderer artifact={releasePatch} />;

/** Same patch pipeline rendered unified, from the arx showcase migration. */
export const UnifiedMigration = () => <DiffRenderer artifact={migrationDiff} />;

// No oldContent/newContent cell: that path renders an empty diff body (DiffFile is
// constructed with no hunks and @git-diff-view/file is not installed), so there is
// no complete composition to capture. See .design-sync/learnings/batch-renderers.md.
