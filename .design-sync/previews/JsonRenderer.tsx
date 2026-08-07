import { JsonRenderer, sampleEnvelopes } from "agent-render";

const manifest = sampleEnvelopes[4].artifacts[4];
const brokenManifest = sampleEnvelopes[5].artifacts[0];

/** Canonical: deeply nested valid manifest rendered as a tree. */
export const ArtifactManifest = () => <JsonRenderer artifact={manifest} />;

/** Malformed JSON (truncated object) exercising the parse-error state. */
export const MalformedManifest = () => <JsonRenderer artifact={brokenManifest} />;
