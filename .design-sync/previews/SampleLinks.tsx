import { SampleLinks } from "agent-render";

// "Viewer bootstrap" preset hash, copied verbatim from the sample card data so is-active matches.
const bootstrapHash = "#dbY7BCsIwDIZfJeSksCle5_DoCwhenIe6ZVrs2tJlczD27mYdgqCXQL785PtH9JjtEuzjLDHDimqjmDBBlu2s6UUBbs5xy0F5wUpwH3HaPsgYQQGzy4j69_AUVLrq8-37uuF2EFz_x3MTGrwLDHVnS9bOwtLlNKdWaxgLCxCIu2Ahb5S2h2NQ94Ysp95JjipQgXWtSoZFAFGQb2N4X9hJPEY8s3G6Tm8";

/** Homepage preset grid, no selection: all six sample envelopes in their rest state. */
export const PresetGrid = () => (
  <SampleLinks activeHash="" animationStyle={{}} />
);

/** Same grid with the "Viewer bootstrap" preset highlighted as the active fragment. */
export const ActivePreset = () => (
  <SampleLinks activeHash={bootstrapHash} animationStyle={{}} />
);
