import { MermaidBlock } from "agent-render";

// Labels carry a trailing nbsp: headless font metrics under-measure node width
// and clip the last glyph otherwise.
const encodePipeline = `flowchart TD
  A["Artifact payload&nbsp;"] --> B["Tuple envelope + dictionary substitution&nbsp;"]
  B --> C["Brotli q11&nbsp;"]
  C --> D{"Wire selection&nbsp;"}
  D -->|"smallest visible&nbsp;"| E["baseBMP fragment&nbsp;"]
  D -->|"max compat&nbsp;"| F["base76 fragment&nbsp;"]`;

const decodeSequence = `sequenceDiagram
  participant U as Browser
  participant V as Viewer shell
  participant C as arx3 codec
  U->>V: open #agent-render=v1 fragment
  V->>C: decodeEnvelope(fragment)
  C->>C: brotli inflate + dictionary expand
  C-->>V: PayloadEnvelope (5 artifacts)
  V-->>U: render active artifact`;

/** Canonical: flowchart of the arx3 encode pipeline. */
export const EncodePipelineFlow = () => <MermaidBlock code={encodePipeline} />;

/** Sequence diagram: fragment decode handshake between browser and viewer. */
export const DecodeSequence = () => <MermaidBlock code={decodeSequence} />;
