/** Freeze or reconstruct external validation inputs without committing third-party source text. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const planPath = path.join(root, 'external-plan.json');
const manifestPath = path.join(root, 'external-manifest.json');
const mode = process.argv[2] ?? 'rebuild';
const output = path.resolve(process.argv[3] ?? path.join(os.tmpdir(), 'arx6-external-validation.json'));
const cache = path.join(os.tmpdir(), 'arx6-external-source-cache');
const hash = value => createHash('sha256').update(value).digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
mkdirSync(cache, { recursive: true });

function fetchBytes(url) {
  return execFileSync('curl', [
    '--fail', '--location', '--silent', '--show-error', '--max-time', '45',
    '--max-filesize', '8388608', '--user-agent', 'agent-render-external-validation', url,
  ], { maxBuffer: 8 * 1024 * 1024, timeout: 50_000, stdio: ['ignore', 'pipe', 'pipe'] });
}

function sampleText(source, kind, plan) {
  if (kind === 'json') {
    JSON.parse(source);
    if (source.length > plan.jsonLimitUtf16) throw new Error('Excluded by the predeclared complete-JSON size limit.');
    return source;
  }
  if (source.length <= plan.textLimitUtf16) return source;
  let end = source.lastIndexOf('\n', plan.textLimitUtf16 - 1) + 1;
  if (end === 0) {
    end = plan.textLimitUtf16;
    if (source.charCodeAt(end - 1) >= 0xd800 && source.charCodeAt(end - 1) <= 0xdbff) end--;
  }
  return source.slice(0, end);
}

function artifact(entry, content) {
  const filename = entry.commitDiff ? `${entry.repository.split('/')[1]}-${entry.commit.slice(0, 12)}.diff` : path.basename(entry.path);
  const body = entry.kind === 'diff' ? { patch: content } : { content };
  return { id: entry.id, family: `external-${entry.kind}`, sourceGroup: entry.repository,
    language: entry.language,
    envelope: { v: 1, codec: 'plain', artifacts: [{ id: 'a', kind: entry.kind, filename, ...body,
      ...(entry.kind === 'code' ? { language: entry.language } : {}),
    }] } };
}

function writeCorpus(corpus) {
  const json = JSON.stringify(corpus);
  writeFileSync(output, json);
  return hash(json);
}

if (mode === 'freeze') {
  if (existsSync(manifestPath)) throw new Error('The external manifest is already frozen. Do not overwrite it after measurement.');
  const planBytes = readFileSync(planPath);
  const plan = JSON.parse(planBytes);
  const sources = [];
  const exclusions = [];
  const repositories = [];
  const corpus = [];
  for (const requested of plan.repositories) {
    const repository = requested.repository;
    let metadata, commit;
    try {
      metadata = JSON.parse(fetchBytes(`https://api.github.com/repos/${repository}`));
      commit = JSON.parse(fetchBytes(`https://api.github.com/repos/${repository}/commits/HEAD`));
      assert.match(commit.sha, /^[0-9a-f]{40}$/);
    } catch (error) {
      exclusions.push({ repository, reason: `Could not pin repository: ${error.message}` });
      process.stderr.write(`Excluded repository ${repository}: metadata access failed.\n`);
      continue;
    }
    repositories.push({ repository, commit: commit.sha, commitDate: commit.commit.committer.date,
      parents: commit.parents.map(parent => parent.sha), defaultBranch: metadata.default_branch,
      repositoryLicense: metadata.license ?? null,
      licenseNote: 'Consult this pinned repository and per-file/data notices; repository metadata does not relicense downloaded samples.',
      pinnedTreeUrl: `https://github.com/${repository}/tree/${commit.sha}`,
    });
    for (const [index, requestedSource] of requested.sources.entries()) {
      const sourceUrl = requestedSource.commitDiff
        ? `https://github.com/${repository}/commit/${commit.sha}.diff`
        : `https://raw.githubusercontent.com/${repository}/${commit.sha}/${requestedSource.path}`;
      const entry = { id: `${repository.replaceAll('/', '--')}--${index + 1}`, repository, commit: commit.sha,
        ...requestedSource, sourceUrl };
      try {
        const sourceBytes = fetchBytes(sourceUrl);
        const source = decode(sourceBytes);
        const content = sampleText(source, entry.kind, plan);
        if (content.length === 0) throw new Error('Empty source text.');
        if (entry.commitDiff && !source.includes('diff --git ')) throw new Error('The pinned commit response was not a git diff.');
        entry.sourceSha256 = hash(sourceBytes);
        entry.sourceBytes = sourceBytes.length;
        entry.sourceUtf16Chars = source.length;
        entry.sampleSha256 = hash(content);
        entry.sliceUtf16 = [0, content.length];
        entry.sampleUtf16Chars = content.length;
        entry.sampleBytes = Buffer.byteLength(content);
        if (entry.path === 'datapackage.json') entry.declaredDataLicenses = JSON.parse(source).licenses ?? null;
        writeFileSync(path.join(cache, `${entry.sourceSha256}.source`), sourceBytes);
        sources.push(entry);
        corpus.push(artifact(entry, content));
        process.stderr.write(`Frozen ${entry.id}: ${entry.kind}, ${content.length} UTF-16 units.\n`);
      } catch (error) {
        exclusions.push({ ...entry, reason: String(error.message).slice(0, 1000) });
        process.stderr.write(`Excluded ${entry.id}: ${String(error.message).split('\n')[0]}\n`);
      }
    }
  }
  assert.ok(corpus.length >= 30, `Only ${corpus.length} external sources were available; do not silently change selection.`);
  assert.ok(new Set(sources.map(entry => entry.repository)).size >= 8, 'Expected at least eight independent repository groups.');
  const corpusSha256 = writeCorpus(corpus);
  const manifest = {
    version: 1, frozenAt: new Date().toISOString(), planSha256: hash(planBytes), corpusSha256,
    phase: 'Frozen before any compression measurement; model development is complete.',
    scope: 'Convenience validation sample, not actual agent traffic. Source files within a repository are correlated. No compression-based inclusion or model changes are permitted from this set.',
    repositories, sources, exclusions,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, samples: corpus.length, repositories: repositories.length,
    exclusions: exclusions.length, corpusSha256, manifestSha256: hash(readFileSync(manifestPath)) }, null, 2)}\n`);
} else if (mode === 'rebuild') {
  const planBytes = readFileSync(planPath);
  const plan = JSON.parse(planBytes);
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(hash(planBytes), manifest.planSha256, 'The predeclared plan changed after freezing.');
  const corpus = manifest.sources.map(entry => {
    const cached = path.join(cache, `${entry.sourceSha256}.source`);
    const sourceBytes = existsSync(cached) ? readFileSync(cached) : fetchBytes(entry.sourceUrl);
    assert.equal(hash(sourceBytes), entry.sourceSha256, `Source bytes changed: ${entry.sourceUrl}`);
    const source = decode(sourceBytes);
    const content = sampleText(source, entry.kind, plan);
    assert.equal(content.length, entry.sampleUtf16Chars);
    assert.equal(hash(content), entry.sampleSha256, `Sample changed: ${entry.id}`);
    return artifact(entry, content);
  });
  const corpusSha256 = writeCorpus(corpus);
  assert.equal(corpusSha256, manifest.corpusSha256, 'Reconstructed corpus differs from its frozen identity.');
  process.stdout.write(`${JSON.stringify({ output, samples: corpus.length, corpusSha256 }, null, 2)}\n`);
} else {
  throw new Error('Usage: node experiments/arx6/external-corpus.mjs [freeze|rebuild] [/tmp/output.json]');
}
