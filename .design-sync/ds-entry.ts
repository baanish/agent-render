// design-sync bundle entry: the library view of this app's components.
// The app has no dist; this is what window.AgentRender exposes.
import "./process-shim";
export { ViewerShell } from "../src/components/viewer-shell";
export { ThemeToggle } from "../src/components/theme-toggle";
export { ArtifactSelector } from "../src/components/viewer/artifact-selector";
export { ArtifactStage } from "../src/components/viewer/artifact-stage";
export { FragmentDetailsDisclosure } from "../src/components/viewer/fragment-details-disclosure";
export { MarkdownRenderer } from "../src/components/renderers/markdown-renderer";
export { CodeRenderer } from "../src/components/renderers/code-renderer";
export { DiffRenderer } from "../src/components/renderers/diff-renderer";
export { CsvRenderer } from "../src/components/renderers/csv-renderer";
export { JsonRenderer } from "../src/components/renderers/json-renderer";
export { MermaidBlock } from "../src/components/renderers/mermaid-block";
export { LinkCreator } from "../src/components/home/link-creator";
export { SampleLinks } from "../src/components/home/sample-links";
// Data, not components: the repo's canonical sample payloads, for previews and
// for building realistic screens with the renderers.
export { sampleEnvelopes } from "../src/lib/payload/examples";
