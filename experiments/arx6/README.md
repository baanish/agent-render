# ARX6: frozen native-frame codec experiment

**Archived native-frame research, not a viewer wire.** The laboratory `#g1L...`
wire is distinct from the production ARX6 implementation under
`src/lib/payload/`. Do not distribute laboratory output as a supported share link.

This is the general ARX6 candidate from the first research pass. The second-pass
reconstruction-program / dependency-order experiments are deliberately excluded:
they did not earn a general-purpose default.

## Run the conformance checks

From the repository root, with Node 22:

```sh
node experiments/arx6/check.mjs
```

This command needs no installed packages and makes no network requests. It reads
the existing three dictionary/prior assets from `public/`; no new corpus is
trained or downloaded. The same 16 cases are registered with the normal Vitest
suite in `tests/arx6-core.test.ts`:

```sh
npx vitest run tests/arx6-core.test.ts
```

The tests cover implementation hashes, CRC32, all UTF-16 code units, lone
surrogates, exact whitespace/control preservation, bounded framing, all three
prior identities, immutable prior copies, bundles/diff metadata, seeded random
round trips, truncation/corruption, decoded limits, and byte-preserving fallback.

## Compare exact production revisions

`compare.mjs` runs each revision in its own Node process, using that checkout's
actual production auto selector, dictionaries, browser Brotli WASM, URL
serialization, and Markdown formatter. It records full `[View](url)` lengths,
wire hashes, exact normalized-envelope round trips, decoded lengths, threshold
counts, and indicative encode/decode timing. Schema fields and every UTF-16 code
unit must survive; only the transport `codec` field is excluded from equality.
Errors and declined candidates remain in the results. It refuses a result if
codec sources change during a worker run.
The measurement calls `encodeEnvelopeAsync` with `budgetByTransport: true` and
no `targetMaxFragmentLength`; explicit target-budget behavior is covered by the
selection tests separately.

`revision` records the checkout's underlying Git HEAD; `sourceSha256` identifies
the actual measured payload sources, including uncommitted changes. The final
consolidation was evaluated from an immutable detached snapshot with the new
sources overlaid, so its base HEAD alone does not identify the final codec.
The later timing and wire replay reports use clean implementation commits:
`532ef99eaac0da9e22823f705826032bb8473a22` before the radix optimization and
`da4f5beb37f41228c0aaec249ea9b76a8a41bb92` after it. All 200 final automatic
outputs are compared by fragment hash and serialized length in the replay.

Create detached snapshots for the reviewed baselines and make the installed
dependencies available to each. The exact reviewed refs are:

- main: `db19bf5ad3ae8d5db03386f35c8815c8d99c50ee`
- PR #121: `431ba6d63fb36606de325a3bf8addf9598e2ce2d`
- PR #117: `c9250c2ee99528ddbc2c7c5f204ff091c95abea7`; its frozen core remains here

For example, from the repository root after `npm ci`:

```sh
git worktree add --detach /tmp/arx6-main db19bf5ad3ae8d5db03386f35c8815c8d99c50ee
git worktree add --detach /tmp/arx6-pr121 431ba6d63fb36606de325a3bf8addf9598e2ce2d
ln -s "$PWD/node_modules" /tmp/arx6-main/node_modules
ln -s "$PWD/node_modules" /tmp/arx6-pr121/node_modules
node experiments/arx6/compare.mjs \
  --corpus experiments/arx6/corpora/diagnostic.json \
  --variant main=/tmp/arx6-main --variant pr121=/tmp/arx6-pr121 \
  --prototype --variant final="$PWD" --out /tmp/arx6-diagnostic.json
```

The first variant is the comparison baseline. Add
`--codec-variant final-arx6=arx6="$PWD"` to measure a standalone codec, exposing
losses that the production portfolio avoids through fallback. Pairwise totals
also compare standalone variants directly. Use `--description "..."` to state
provenance when evaluating a non-synthetic corpus.

The PR #117 prototype is measured
alone and with a **hypothetical** exact-baseline fallback, explicitly labeled in
the report. It is not silently credited with a fallback it does not implement.
Only hashes and measurements are emitted, not unsupported viewer links. A local
`file:` fetch adapter loads the unchanged browser Brotli WASM binary in Node;
the benchmark does not substitute native zlib compression.

The original `bench.mts` remains a quick current-checkout versus prototype
comparison. Its "production baseline" means the current checkout, so it must not
be used to claim a gain over pre-ARX6 main after production changes are applied.

## Frozen evaluation inputs

`corpora/manifest.json` pins the deterministic generator and two 52-case synthetic
corpora, each covering 13 families at four scales. During the initial g2 pass,
the diagnostic split guided design; the separately seeded validation split was
frozen before model selection and reserved until the candidate model and
representation were selected. Both splits are diagnostic in the later g3 pass. These
are synthetic generality checks, not independently collected real-world holdout
data. The validation split also changes the prose and source-code languages.

`corpora/capacity-manifest.json` pins 24 larger synthetic cases at preset 2k, 8k,
24k, and 64k source-character targets across six families. This cohort was added
after diagnostic measurements showed too few large links. Its sizes were not
filtered or tuned against candidate lengths. Cases exceeding the 8,192-character
fragment budget still appear, and decode with a budget override solely to check
codec correctness; they are not counted as shareable.

`corpora/natural-manifest.json` describes 35 package README, source, and JSON
snippets from installed dependencies, selected by a fixed package-name stride.
The model researcher reserved these before initial g2 candidate evaluation. It includes
package versions, source/snippet hashes, and license metadata. Third-party source
text is not vendored; reconstruct the exact corpus after dependency installation:

```sh
node experiments/arx6/rebuild-natural-corpus.mjs /tmp/arx6-natural-validation.json
```

Reconstruction checks every package version and source hash. These snippets are
natural text unseen during the initial g2 model selection, but were inspected
before the later g3 pass and are now diagnostic. Dependency
packages are not representative of all user artifacts and prior public exposure
cannot be ruled out. Neither synthetic nor dependency results justify a universal
compression percentage. The production fallback policy must establish the
no-size-regression property independently of these samples.

`external-plan.json` and `external-manifest.json` describe a second natural
validation corpus for the initial g2 pass, now diagnostic for g3: 35 samples
from ten pinned public repositories, including
four real CSV files, four commit diffs, and five genuinely non-English prose
inputs. Paths and size rules were chosen before fetching; two missing paths
were excluded without replacement, before compression. `external-quality.json`
records an upstream CSV header/row mismatch and distinguishes the English README
in a Japanese repository from actual Japanese text. Inputs are preserved verbatim.

```sh
node experiments/arx6/external-corpus.mjs rebuild /tmp/arx6-external-validation.json
```

The additional research pass reserves `extra-pass-plan.json` and
`extra-pass-manifest.json`: 27 inputs from eight other repositories, covering
Markdown, Python/JavaScript/TypeScript/Rust/TOML, complete JSON, CSV, real commit
diffs, and Chinese/Spanish prose. The 28 requested paths and fixed size limits
were declared before fetching; one missing JSON path was excluded without
replacement. No candidate is evaluated on this set before its source is frozen.
Previously inspected cohorts are diagnostic data in this pass. This remains a
convenience sample of public text, not representative agent traffic or proof of
universal compression gains. Source text stays outside the repository.

```sh
node experiments/arx6/extra-pass-corpus.mjs rebuild /tmp/arx6-extra-pass-validation.json
```

The extra-pass candidate policy was frozen before this validation: g3's added
nonword-skeleton and digit-masked history contexts, the same kind-prior versus
unprimed competition, and the complete legacy auto pool. It does not encode both
g2 and g3 to select between them. The fresh 27 inputs produced 45,006 complete
Markdown characters versus 45,425 for g2: 22 shorter links, two equal lengths,
and three losses of one to three characters. See `results/extra-pass-validation.json`
and `extra-pass-candidate-freeze.json` for the exact candidate and source records.

`extra-pass-replay.mjs` verifies the integrated g3 implementation reproduces all
27 candidate wires and checks 227 exact envelope round trips across the prior
200 inputs plus the fresh set. Earlier cohorts are diagnostic in this pass;
the replay records g2 regressions, including larger unshareable entropy inputs,
alongside the exact legacy fallback checks.

```sh
node experiments/arx6/extra-pass-replay.mjs build \
  /tmp/arx6-final-replay.json /tmp/arx6-extra-pass-validation.json \
  /tmp/arx6-extra-pass-replay.json
node experiments/arx6/compare.mjs --corpus /tmp/arx6-extra-pass-replay.json \
  --variant integrated-g3="$PWD" --out /tmp/arx6-extra-pass-replay-result.json
node experiments/arx6/extra-pass-replay.mjs verify /tmp/arx6-extra-pass-replay-result.json
```

The extra-pass implementation was measured at local commit `7c3ce2e` and
published as `abcd64922cf6b3825a11cdf27c61b5a23892ea5c`; both name the identical
Git tree `b4142bd8af3369087d26f1782744c51401865187`. The clean g2 baseline is
`5d82b9fa23a831986286e8666ca7307c586ef3a1`. `results/extra-pass-timing.json` and
`extra-pass-timing-summary.mjs` record the separate ordered runtime comparison
and verify all 78 timing wires against the corresponding prior measurement or
integration replay. The runtime comparison includes both the model change and
the byte-preserving omission of mathematically dominated Unicode conversions.

`timing-corpus.mjs` creates a performance-only input set from the 52 diagnostic
and 24 capacity cases, plus two fixed near-limit inputs at 199,900 normalized JSON
characters each. Its manifest pins the generator and input hashes; generated
content stays outside the repository. It is not used to choose the model or wire.
The initial timing pass exposed quadratic legacy radix conversion and motivated
a byte-preserving runtime optimization. The corpus bytes remained unchanged;
the optimized encoder is replayed against all previously measured final automatic-selection wires.

```sh
node experiments/arx6/timing-corpus.mjs /tmp/arx6-timing-corpus.json
```

Timing summaries are one ordered pass with lazy first-use costs. Module imports
and synchronous asset loading precede the timed encode/decode calls. Report
hardware/concurrency limitations; they are not repeated, statistically controlled
latency benchmarks. `peakRssKiB` includes the whole worker process and loaded
dependencies, not just codec state.

After reconstructing the natural, external, and timing inputs above, reproduce
the exact-output replay against a clean optimized implementation snapshot:

```sh
node experiments/arx6/replay.mjs build \
  /tmp/arx6-natural-validation.json /tmp/arx6-external-validation.json \
  /tmp/arx6-timing-corpus.json /tmp/arx6-final-replay.json
git worktree add --detach /tmp/arx6-g2-replay da4f5beb37f41228c0aaec249ea9b76a8a41bb92
ln -s "$PWD/node_modules" /tmp/arx6-g2-replay/node_modules
node experiments/arx6/compare.mjs --corpus /tmp/arx6-final-replay.json \
  --variant optimized=/tmp/arx6-g2-replay --out /tmp/arx6-replay.json
node experiments/arx6/replay.mjs verify /tmp/arx6-replay.json /tmp/arx6-replay-verified.json
```

`results/consolidated-timing-original.json` preserves the initial pass.
`results/consolidated-timing-optimized.json` measures the same inputs after the
radix optimization, while `results/consolidated-replay.json` checks all 198
compression cases plus the two near-limit cases. Replay timings overlap other
validation and are not performance evidence. `summarize-timing.mjs` verifies the
78 timing wires match and derives `results/timing-summary.json`, including
separate shareable-fragment and 2,000-character complete-link subsets. The Node
harness can finish encodes beyond the browser Worker's 60-second deadline;
the summary explicitly identifies those cases and their shareability.

## Additional diagnostic experiments

The extra-pass model search, all-prior search, framing alternatives, and priming
checkpoints are archived separately. These are diagnostic experiments; their
timings overlap other work and must not replace the ordered production timing
reports. The prior/framing/checkpoint scripts explicitly use frozen g2 even when
the current default emits g3. Run them into temporary outputs to preserve the
historical measurements:

```sh
node experiments/arx6/extra-model-ablation.mjs experiments/arx6/corpora/diagnostic.json /tmp/arx6-models.json wire
node experiments/arx6/extra-priors.mjs experiments/arx6/corpora/diagnostic.json /tmp/arx6-priors.json
node experiments/arx6/extra-framing-ablation.mjs experiments/arx6/corpora/diagnostic.json /tmp/arx6-framing.json
node experiments/arx6/extra-checkpoint.mjs /tmp/arx6-checkpoints.json
```

See `results/extra-model-ablations.json`, `extra-priors-results.json`,
`extra-framing-results.json`, and `extra-checkpoint-results.json`; the framing
and checkpoint notes explain why those alternatives were not adopted.

## What is frozen

`src/cm6.mjs`, `src/native-frame.mjs`, `src/arx6-core.mjs`, and its `.d.mts` are copied
byte-for-byte from the evaluated prototype. Keep the wire-affecting code frozen;
a model/representation/prior change needs a new version and compatibility plan,
not a casual golden update. The source-hash test intentionally detects even
formatting changes. If a later cleanup changes formatting only, document it and
also prove unchanged wire vectors before replacing these source pins.

`runtime.mjs` is Node-only laboratory glue. It reproduces the ARX2 tuple mapping
without modifying or importing private production helpers. Application
integration should expose/reuse the canonical production tuple helpers instead
of maintaining this duplicate mapping indefinitely.

The browser-safe core returns **unknown tuples**, not validated application
envelopes. It is not an alternative to schema validation. CRC32 detects accidental
corruption, not malicious tampering or secret disclosure. The archived prototype's
8,192-character budget includes `#`, whereas the application budgets fragment
bodies. The comparison retains that historical difference and reports prototype
declines; versioned production ARX6 uses the application's budget and schema validation.

See [research notes](../../docs/arx6-research.md) for the historical measurements,
consolidated validation evidence, and remaining coverage limits.
