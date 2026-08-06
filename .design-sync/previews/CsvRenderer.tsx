import { CsvRenderer, sampleEnvelopes } from "agent-render";

const metricsSnapshot = sampleEnvelopes[3].artifacts[0];
const codecBenchmarks = sampleEnvelopes[4].artifacts[3];

/** Canonical: small metrics table with quoted fields. */
export const MetricsSnapshot = () => <CsvRenderer artifact={metricsSnapshot} />;

/** Numeric benchmark table from the arx showcase bundle. */
export const CodecBenchmarks = () => <CsvRenderer artifact={codecBenchmarks} />;
