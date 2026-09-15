import type { PayloadEnvelope } from '../../src/lib/payload/schema';
import type { Arx6Codec, Arx6Corpora, Arx6PriorId } from './src/arx6-core.mjs';
/** Load only the existing version-1 assets and verify their hashes. */
export function createLabCodec(): Promise<{ codec: Readonly<Arx6Codec>; corpora: Arx6Corpora }>;
/** Convert a previously validated envelope to the unchanged experimental tuple mapping. */
export function envelopeToTuple(envelope: PayloadEnvelope): unknown;
/** Select the frozen kind-dependent prior. */
export function priorForEnvelope(envelope: PayloadEnvelope): Arx6PriorId;
