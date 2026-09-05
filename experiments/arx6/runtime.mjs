/** Node-only laboratory glue. Never imported by the deployed viewer. */
import { readFileSync } from 'node:fs';
import { createArx6Codec } from './src/arx6-core.mjs';

function readAsset(name) {
  return JSON.parse(readFileSync(new URL(`../../public/${name}`, import.meta.url), 'utf8'));
}

/** Rebuild the three existing priors; the codec checks their bytes against SHA-256 pins. */
export async function createLabCodec() {
  const base = readAsset('arx-dictionary.json');
  const overlay = readAsset('arx2-dictionary.json');
  const asset = readAsset('arx4-priors.json');
  if (base.version !== 1 || overlay.version !== 1 || asset.version !== 1) {
    throw new Error('ARX6 v1 requires the version-1 base, overlay, and curated assets.');
  }
  const common = [
    ...base.singleByteSlots, ...base.extendedSlots,
    ...overlay.singleByteSlots, ...overlay.extendedSlots,
  ].join('\n');
  const corpora = Object.fromEntries(Object.entries({ m: 'markdown', c: 'code', j: 'json' })
    .map(([id, kind]) => [id, new TextEncoder().encode(`${common}\n${asset.kinds[kind]}`)]));
  return { codec: await createArx6Codec(corpora), corpora };
}

function trim(fields) {
  let end = fields.length;
  while (end > 0 && fields[end - 1] === undefined) end--;
  return fields.slice(0, end).map(value => value === undefined ? null : value);
}

function artifactTuple(artifact) {
  switch (artifact.kind) {
    case 'markdown': return trim(['m', artifact.id, artifact.content, artifact.title, artifact.filename]);
    case 'code': return trim(['c', artifact.id, artifact.content, artifact.language, artifact.title, artifact.filename]);
    case 'diff': return trim(['d', artifact.id, artifact.patch, artifact.oldContent, artifact.newContent,
      artifact.language, artifact.view, artifact.title, artifact.filename]);
    case 'csv': return trim(['s', artifact.id, artifact.content, artifact.title, artifact.filename]);
    case 'json': return trim(['j', artifact.id, artifact.content, artifact.title, artifact.filename]);
    default: throw new Error('Unsupported artifact kind.');
  }
}

/** Laboratory copy of the frozen ARX2 tuple mapping; callers validate envelopes first. */
export function envelopeToTuple(envelope) {
  const artifacts = envelope.artifacts.map(artifactTuple);
  const activeIndex = envelope.artifacts.findIndex(artifact => artifact.id === envelope.activeArtifactId);
  return artifacts.length === 1
    ? trim([3, artifacts[0], envelope.title])
    : trim([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

/** Select the same kind-dependent prior used in the frozen experiment. */
export function priorForEnvelope(envelope) {
  const id = { markdown: 'm', code: 'c', diff: 'c', csv: 'j', json: 'j' }[envelope.artifacts[0]?.kind];
  if (!id) throw new Error('An envelope must contain a supported artifact.');
  return id;
}
