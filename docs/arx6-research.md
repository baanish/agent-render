# ARX6 v2: consolidated design and research findings

This implementation combines [PR #117](https://github.com/baanish/agent-render/pull/117)
and [PR #121](https://github.com/baanish/agent-render/pull/121), then addresses their
compatibility, correctness, selection, and browser-execution gaps. ARX6 is an
additional candidate in the full existing codec portfolio. Default selection
replaces the old automatic result only for a strictly shorter serialized
fragment; ties and losses keep the exact old wire.

Selection checks both the conservative chat-transport score and the actual
WHATWG-serialized fragment length. This gives a per-input URL/Markdown size
guarantee relative to the available pre-ARX6 pool for the same base URL and label
in unconstrained/default selection, or when the old candidate meets the same
requested budget. An explicit policy budget takes priority when only ARX6 fits.
It is not a per-input size guarantee against #121's original ARX6 format.
It does not guarantee that ARX6 itself wins on every artifact, that latency
decreases, or that a benchmark's percentage applies to future traffic.

## Source PR disposition

| Source | Retained | Changed or excluded |
| --- | --- | --- |
| #117, frozen `#g1L` research codec | Original source, source hashes, conformance checks, and qualified historical evidence in `experiments/arx6/`; lossless WTF-8, integrity framing, and causal lexical/class modeling informed v2 | Native binary tuple frame and its separate viewer decoder were not added to the production protocol; the frozen `#g1L` wire remains experimental |
| #121, raw-container/fraction integration | Raw body exposure, compact tuple trailer, reversible diff-header elision, arithmetic fraction transport, curated prior composition, legacy decode support, and integer context mixing | New emission uses explicit version `2`, canonical WTF-8, checksum and canonicality checks, normal schema/size validation, and the complete old auto pool; the old model remains frozen |
| Consolidation | Bounded browser Worker, cancellation, immutable asset installation, adversarial tests, exact-revision comparisons, and separate diagnostic/validation cohorts | No new corpus-specific prior, numeric-table reconstruction program, dense-Unicode scoring policy, or claim of universal compression improvement |

PR #121's approximately 14% claim described its own uncommitted 214-artifact
corpus against ARX5, with different framing and selection behavior. It is not a
measurement of this version, the complete production auto pool, or a committed
independent corpus. The #117 historical results below use another baseline.
These percentages must not be averaged or presented as a combined improvement.

## Review findings resolved

| Finding | Resolution |
| --- | --- |
| A successful #121 ARX6 candidate skipped ARX5, allowing auto-selection to return a longer link | Evaluate the complete old pool and retain its exact winner unless ARX6 strictly improves serialized length |
| Conservative punctuation escaping could overestimate a legacy base76 link compared with the URL actually copied | Require a prospective ARX6 winner to beat the exact old winner under WHATWG URL serialization as well as the conservative transport score, provided the old winner satisfies the same explicit budget |
| A tuple trailer could reject some truncation without detecting all plausible corruption | Bind version/prior/raw bytes with CRC32 and reject noncanonical fraction aliases |
| A heuristic fraction-search starting point could skip a shorter valid numerator, especially after adding the CRC constraint | Start from the rigorous decoder-materialization lower bound and verify the shortest canonical interval/residue choice |
| #121 declined bodies with lone surrogates because UTF-8 could not carry them; exact body boundaries also required UTF-16 accounting | Use canonical WTF-8 and slice reconstructed bodies by exact UTF-16 lengths |
| A numeric optional diff `patch` could be mistaken for a body-length placeholder and shift valid old/new bodies | Normalize absent/non-string optional body fields before constructing placeholders |
| A compact container could fit its own limit while the reconstructed JSON envelope exceeded the application budget | Validate and budget the full normalized envelope, including escaping, metadata, and expanded diff text; retain the typed too-large error |
| Caller-owned dictionary arrays or curated prior blocks could mutate after successful identity validation | Copy/freeze installed assets and avoid exposing mutable internal prior state |
| Mutating a context model in place would make existing links undecodable | Freeze the original model and give the new model an explicit `2` wire version |
| Async APIs still executed CPU-heavy mixing on the browser main thread | Use a bounded Worker with cancellation, deadlines, serial jobs, and idle release |
| The complete old portfolio repeatedly converted large integers one digit at a time, making large candidate wires expensive even when never selected | Use balanced radix splits and construct integers from byte hex, preserving every emitted digit |

## Production wire and losslessness

New fragments have the shape:

```text
#g2<prior-id><digits>
```

The raw container concatenates artifact bodies, then a newline and the canonical
ARX2 tuple JSON with body-length placeholders. The lengths count UTF-16 code
units, with `-1` for the final body. This makes real lines and quotes visible to
the model instead of JSON-escaped or dictionary-substituted body text. Canonical
WTF-8 preserves all JavaScript strings, including lone surrogates, BOMs, NULs,
non-BMP characters, and adjacent artifact boundaries. Tuple metadata uses the
existing canonical helpers and normal envelope validation.

Diff-header elision removes only redundant paths and hunk counts that can be
reconstructed exactly. The encoder checks restoration before selecting the
elided form; unusual patches remain verbatim. The decoder bounds expansion and
checks that restoring and re-eliding produces the stored representation.

The fraction uses RFC 3986 unreserved `0-9A-Za-z-._~` for its prefix and only
62 alphanumeric digits for its final position. For `n` digits, denominator
`D = 62 × 66^(n-1)` and numerator `N = 62 × base66(prefix) + base62(last)`.
This mixed-radix wire avoids byte-aligned arithmetic flush overhead as well as
using a slightly larger alphabet than base64url. A 66-character alphabet alone
offers only about 0.7% more bits per character than 64 characters. Gains larger
than that must come from modeling or framing, not visible-Unicode counts.

V2 embeds the complete 32-bit CRC in the choice of fraction: choose the shortest
`n`, then the smallest `N` inside the final coding interval such that
`N mod 2^32 = CRC32(ASCII("g2" + prior) || canonical-WTF8(container))`. There is
no separate checksum suffix. This can recover framing space otherwise wasted by a
six-character base62 CRC while binding the raw bytes to the version and prior.
The digit search starts at a rigorous lower bound derived from the decoder's
required byte window; an interval-width heuristic could skip a shorter aligned
fraction. Constructed interval checks cover this edge case separately from corpus
compression measurements.

A tuple trailer alone is insufficient to detect corruption: an altered arithmetic
stream can still reconstruct plausible text. V2 checks the embedded checksum and
requires canonical fraction/length encodings. CRC32 detects accidental corruption,
not deliberate forgery; schema, resource, and renderer protections still treat
every payload as untrusted.

Original `#gm`, `#gc`, `#gj`, `#gs`, and `#gn` links decode with the frozen original
model. They are not reinterpreted as v2. The frozen #117 `#g1L` core remains
separate research code and is not a supported viewer link.

## Model changes and rejected alternatives

V2 combines #121's line, run, deterministic-slot, two-layer mixer, and adaptive
probability-map inputs with #117's causal previous-word and rolling byte-class
contexts. It tracks the previous two words and five recent ASCII byte classes.
ASCII case folding applies only to word hashes so differently capitalized words
can share statistics; the coded source bytes retain their exact case. A
zero-initialized residual mixer learns corrections conditioned on syntax class
and the partial byte.

Direct order-0/order-1 context and run tables replace unnecessarily large hash
tables. The new lexical/class tables use 18-bit indexes. Per-model typed arrays
measure approximately 50.45 MiB versus 53.91 MiB for the original #121 model.
These counts exclude shared lookup constants, JavaScript objects, transient
buffers, and peak process memory; they are not browser memory guarantees.

Diagnostics did not justify four-, five-, or six-byte match discovery, dedicated
UTF-8 class buckets, an additional first-layer mixer, first-nonwhitespace line
classification, sparse skip-byte contexts, uncapped hit counts, or changing the
initial weight normalization. Those variants were excluded. No model tuning uses
the reserved validation cohorts. Primed-model snapshot caching was also deferred:
it would retain roughly another 50 MiB per cached v2 model and require carefully
verified copies of all adaptive state. Current coding replays the chosen prior;
the Worker improves responsiveness, not the amount of compression work.

ARX6 also compares its available kind prior with no prior (`n`) and keeps the
shorter complete wire. This tests whether inherited statistics actually help the
input rather than assuming that priming is always beneficial. It adds encoding
work, but decode runs only the single prior identified by the winning link.
Explicit prior requests bypass this competition, and ties keep the kind prior.

The reproducible [model ablations](../experiments/arx6/results/model-ablations.json)
retain all exploration rounds and distinguish early bit-only scores from later
framed-link measurements. Under the same framing on the 52 diagnostic inputs,
the original model used 32,561 formatted-link characters, the selected v2 model
31,745 (2.51% less), and additionally competing with `n` used 30,813 (a further
2.94% less). These are development comparisons of standalone candidates, not
production-portfolio or validation results. No-prior competition added about 14%
encode time in that exploratory run; do not treat it as a device-wide latency
prediction.

## Generalization and candidate selection

The design looks for broadly occurring structure: raw rows, lexical reuse,
character classes, repetition, and reversible format redundancy. It does not add
target artifacts to the curated priors, branch on sample identities, or encode
known answers. Curated priors retain their byte identities; installation owns
its data so caller mutation cannot silently change an existing wire version.

Default automatic selection always evaluates the existing ARX5, ARX2, ARX, deflate, LZ,
and plain candidates before accepting ARX6. A candidate is compared with its
complete header, checksum, and conservative serialized transport cost included.
A second check compares the prospective ARX6 winner with the old winner's exact
WHATWG-serialized fragment length. The conservative policy overcounts some ASCII
punctuation that browsers retain; winning that estimate alone is insufficient
unless only ARX6 satisfies an explicit requested policy budget.
ARX3/ARX4 remain readable but are excluded from automatic selection because
visible Unicode character counts do not reflect percent-encoded link costs.

Fallback limits per-input compression regressions; it does not establish a
model's statistical generality. Evaluation separates five cohorts:

| Cohort | Selection and purpose | Limitations |
| --- | --- | --- |
| 52 generated diagnostics | 13 families including code, prose, tables, structured text, diffs, Unicode, and high-entropy counterexamples; may guide development | Synthetic development data, not independent evidence |
| 52 generated validation cases | Same families with separate fixed seeds; reserved until model/representation freeze | Correlated with the diagnostic generator, not independently collected agent output |
| 24 generated capacity cases | Six families at preset 2k/8k/24k/64k body sizes; added after diagnostics exposed too few near-limit links, without filtering on encoded length | Synthetic threshold/size stress, not a sample of typical traffic |
| 35 dependency snippets | Fixed sorted unscoped-package stride: 12 READMEs, 12 code samples, 11 JSON samples, each at most 6,000 UTF-16 code units; source/version/license hashes recorded, source text reconstructed locally | Public package text, not representative agent output; prior exposure cannot be ruled out |
| 35 external public artifacts | Fixed plan across 10 pinned repositories: 14 Markdown/prose, eight code, five whole JSON, four CSV, four real commit diffs; frozen before any codec measurement | Small correlated software sample; numerical time-series CSV only; five genuinely non-English snippets (three Chinese, two Japanese) |

Validation, capacity, and dependency snippets were reserved until model and
representation choices were frozen. The additional external set was selected
under a fixed plan after the model freeze; no model tuning used its results.
Its [manifest](../experiments/arx6/external-manifest.json) and
[quality notes](../experiments/arx6/external-quality.json) preserve source
hashes and anomalies: two planned TypeScript paths were absent and not replaced,
one upstream CO2 CSV has different header/data field counts and stays verbatim,
and an English README from a Japanese repository is not counted as non-English.
Third-party source text is reconstructed, not committed as application fixtures.
An independently collected, source-grouped real-agent corpus is still needed for
broad population claims.

## Browser execution and deployment

An async function does not move its synchronous coding loop off the main thread.
Browser link creation, editing, bundle selection, and decoding therefore use a
single lazy Worker with a FIFO queue, at most eight outstanding jobs, and a
60-second deadline including queueing and asset loading. Aborting an active job
or reaching its deadline terminates the Worker; it also shuts down after 15 idle
seconds to release model caches. Worker startup/runtime failures return explicit
errors instead of repeating the work on the main thread. Node and runtimes
without Worker support retain the direct async APIs.

The Worker and existing dictionaries/priors are static assets under the normal
base path. No artifact upload, server-side codec, new compression dependency, or
per-artifact fetch is introduced. A decoder must load the exact prior identified
by its link or fail. An unprimed `#g2n` link needs no dictionaries or curated prior
assets; decoding it skips those fetches entirely. Encoding can still produce the
unprimed candidate when pinned assets are unavailable. When only curated priors
are unavailable, the dictionary-derived `s` prior can compete with `n`.

### Legacy radix conversion

A separate performance review found repeated whole-integer radix conversion in
the old automatic pool: four old encoding paths each considered three such wire
alphabets. The encoder now splits integers at balanced radix powers and builds
byte integers from hex instead of repeatedly growing them one byte at a time.
This changes the computation, not the codec model, digit alphabet, padding, or
wire representation. Legacy decoders stay unchanged.

An [exact replay](../experiments/arx6/results/consolidated-replay.json) from
implementation commit `da4f5be` reproduced all 200 automatic wire hashes and
lengths: the 198 compression samples plus two near-limit boundary cases. All
normalized schema/UTF-16 round trips also remained exact. The conversion changes
happened after model/representation freeze and are not additional compression
tuning. The replay itself is correctness evidence, not a latency measurement.

## Current benchmark evidence

The table counts every character in `[View](https://agent-render.com/#...)`
using real URL serialization and the production Markdown formatter. Old auto is
main `db19bf5`; #121 is `431ba6d`. The #117 column measures its frozen standalone
experimental codec, not a deployed portfolio. Reports retain all six lanes,
including standalone #121 and v2, plus source/asset hashes and per-input rows.
The production Brotli-WASM binary is used without a native-zlib substitute.
Only exact normalized-envelope round trips count; codec identity is transport
metadata, while all other schema fields and UTF-16 code units are checked.

| Cohort | Cases | Old auto | #117 standalone | #121 auto | V2 auto | Saving vs old auto | Wins / exact ties / losses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [Generated diagnostic](../experiments/arx6/results/consolidated-diagnostic.json) | 52 | 36,171 | 35,302 | 32,173 | 30,775 | 14.92% | 49 / 3 / 0 |
| [Reserved generated validation](../experiments/arx6/results/consolidated-validation.json) | 52 | 36,330 | 35,390 | 32,302 | 30,854 | 15.07% | 49 / 3 / 0 |
| [Dependency snippets](../experiments/arx6/results/consolidated-natural.json) | 35 | 47,800 | 43,717 | 41,048 | 39,857 | 16.62% | 35 / 0 / 0 |
| [Generated capacity stress](../experiments/arx6/results/consolidated-capacity.json) | 24 | 327,729 | — (13/24 supported) | 312,126 | 303,900 | 7.27% | 22 / 2 / 0 |
| [External public artifacts](../experiments/arx6/results/consolidated-external.json) | 35 | 86,631 | 79,805 | 74,990 | 72,694 | 16.09% | 35 / 0 / 0 |

Across all 198 final-auto cases, every normalized round trip is exact: 190 links
are shorter than old auto and eight retain its wire byte for byte. Excluding the
52 development diagnostics leaves 146 reserved cases with 141 wins, five exact
ties, and no losses. These are outcomes on the named cohorts, not a traffic-wide
success rate. Oversized stress links are round-tripped with the benchmark's
fragment-limit override; a successful stress round trip does not make them
shareable within the product's normal fragment budget.

The #117 prototype declines 11 capacity cases above its fixed fragment budget;
its partial successful total is deliberately not compared with full-cohort sums.
The size guarantee and win/tie/loss columns compare v2 auto with pre-ARX6 auto.
They do not imply a per-input improvement over #121. On the reserved synthetic
cohort, v2 auto is 4.48% shorter in aggregate than #121 auto but is longer on 16
of 52 cases. The dependency cohort is 2.90% shorter than #121 auto, with 34 wins
and one two-character loss. The external set is 3.06% shorter than #121 auto,
with 35/35 wins; capacity is 2.64% shorter, with one ten-character loss, 21 wins,
and two ties. Integrity and versioning have a cost on small links.
Standalone v2 also loses to old auto on three inputs in each generated 52-case
cohort; portfolio fallback keeps the exact old wires for those cases.

For dependency snippets, complete links fitting 2,000 characters increase from
26/35 under old auto to 29/35 under v2 (also 29/35 under #121). Both generated
52-case cohorts retain 50/52 fitting links. The capacity set retains 5/24 below
2,000 characters and improves the number within the 8,192-character fragment
budget from 13/24 to 14/24. These counts describe the fixed artifacts tested, not
a maximum-prefix search or a general capacity multiplier. External artifacts
retain 16/35 fitting complete 2,000-character links.

Commands and corpus provenance are in
[`experiments/arx6/README.md`](../experiments/arx6/README.md). The report's
`sourceSha256` identifies the actual evaluated source tree: the final candidate
was measured from a frozen working-tree snapshot, so its checkout `revision`
alone does not identify the complete candidate implementation. After that snapshot,
an explicit-budget selector correction was added; these comparisons omit
`targetMaxFragmentLength`, so their measured behavior is unaffected. The later
radix conversion optimization reproduces all measured wires exactly, as checked
by the replay above. The model, wire, and default prior selection stayed frozen.
Historical timing or corpus scores below are not replacement measurements for
this comparison.

### Runtime and memory cost

The [timing summary](../experiments/arx6/results/timing-summary.json) compares one
ordered process pass per variant over the same 78 inputs: 52 diagnostics, 24
capacity cases, and two performance-only boundaries with 199,900-character
normalized JSON envelopes. It ran after known heavy validation jobs stopped, on
Linux x64, Node 24.19.0, and an AMD EPYC 7763 host with four available CPUs.
These are observed timings, not a repeated statistical experiment or a mobile
browser guarantee. Calls include lazy first-use work but exclude module imports
and synchronous asset loading. ARX6 calls rebuild their model and replay any
selected prior; there is no primed snapshot cache.

| Automatic encoder | Encode P50 | Encode P95 | Maximum encode | Decode P50 | Peak process RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Old auto, `db19bf5` | 112 ms | 6.97 s | 244.20 s | 56 ms | 466.36 MiB |
| V2 before radix optimization, `532ef99` | 487 ms | 10.37 s | 251.87 s | 295 ms | 584.13 MiB |
| V2 with radix optimization, `da4f5be` | 474 ms | 3.68 s | 12.71 s | 294 ms | 480.08 MiB |

The optimized run preserves all 78 final wire hashes and lengths. Its decode
P95 is 917 ms and maximum is 3.88 seconds. Peak RSS covers the entire process,
including all cases, modules, assets, WASM, garbage collection, and retained
heaps; it is not the allocation of one codec or a browser memory ceiling.

Typical shareable links still require substantially more CPU than old auto.
On the same 66 inputs whose fragments fit 8,192 characters under every variant,
old encode P50/P95/maximum is 102/350/654 ms; optimized v2 is
446/999/4,892 ms. Decode is 56/94/112 ms versus 287/354/488 ms. The full old
candidate pool, stronger model, and prior competition add work even when the
winning wire is unchanged. The Worker keeps that work off the UI thread; it
does not remove the cost.

The seeded high-entropy boundary fell from 251.87 seconds before the radix
optimization to 12.71 seconds afterward, but its 201,284-character complete link
still cannot be shared within the normal budget. The repeated-text boundary
keeps the exact old 112-character link while taking 4.89 seconds to encode,
versus 0.60 seconds under old auto. No optimized encode in this pass exceeded
the browser's 60-second deadline; that observation does not establish a
worst-case bound on other devices, queued work, or asset loading.

## Historical measurements, not new production-baseline results

The original #117 research import named base revision
`72fb152e0cf92a11ff658c3b0dd3916b387f3e98`. Its archived measurements below remain
separate from the current exact-revision production comparison.

The original development set had 40 artifacts from 18 source groups. The model
was then frozen before evaluation on 93 artifacts from 47 disjoint source groups.
The source groups and artifact kinds are software-text proxies, not a measured
sample of actual agent traffic; samples within groups are correlated.

The historical baseline was the shorter of exact ARX5 entropy/base64url and
ARX2 with **Node Brotli q11**, not the complete production auto pool and not a
byte-identical validation of brotli-wasm. Those historical numbers cannot be
substituted for the current exact-revision comparisons above.

| Kind | Samples | Aggregate full-link saving with fallback |
|---|---:|---:|
| Markdown | 20 | 5.76% |
| Code | 20 | 6.03% |
| Diff | 20 | 5.91% |
| CSV | 13 | 12.36% |
| JSON | 20 | 8.52% |
| Overall | 93 | 7.41% |

Standalone ARX6 saved 7.36% aggregate, with 3 regressions and a worst regression
of 2.77%. The portfolio won 90/93 comparisons and kept the legacy wire on the
other three. Entire artifacts fitting 2,000 characters went from 75 to 76.
These scores count `[View](https://agent-render.com/#...)`, not visible glyphs.

The existing report fixture was a **separate diagnostic, not holdout evidence**.
Its full link fell from 2,616 to 2,301 characters, still over the limit. Exhaustive
complete-line prefix testing increased the largest fitting prefix from 5,867 to
7,158 source characters at the same 1,996-character link size. That 22% capacity
gain applies to this fixture, not arbitrary inputs.

The historical summaries and freeze record are retained under
`experiments/arx6/results/`. Their filenames and timings refer to the original
laboratory archive. Third-party corpus text and its large license bundle are not
republished as MIT application fixtures. Any new permitted, independently sourced
corpus must retain its own provenance and separately reported results.

The original environment measured median encode times of 105 ms for ARX6 versus
56 ms for ARX5 and approximately 37.87 MiB versus 33.51 MiB of typed arrays. These
are neither peak-RSS measurements nor production/browser latency guarantees.
Async installation does not make the compression loop non-blocking.

## Second-pass research disposition

Dependency-aware numeric reconstruction programs and compression-chosen decode
order produced large synthetic specialist wins, but only 0.24% aggregate saving
on a fresh general-software set over ARX6. A separate 12-input natural CSV set
improved 4.21% with fallback, while the table method alone regressed 3.84% on the
ten inputs where it activated. A later root-only numeric ablation beat the graph
on some natural inputs. These results do not justify including that machinery in
this general codec PR. No universal breakthrough or scientific-first claim is
made here.

## Verification and remaining limits

The final application validation passed 492 unit tests across 61 files and all
116 Playwright checks across Chromium and WebKit. Lint, TypeScript, the static
production root and subpath builds, build-budget checks, and the existing codec benchmark
also passed; the historical benchmark fixture totals were unchanged.
The strict self-hosted CSP smoke passed with actual ARX6 and ARX2 Worker
generation/preview, including Brotli WASM, and no CSP violations.

The application tests cover frozen legacy decoding, v2 deterministic vectors,
all UTF-16 code units, corruption/canonicality rejection, prior ownership,
reconstructed envelope budgets, full-pool fallback, and browser Worker lifecycle.
Chromium and WebKit checks compare browser output against Node and exercise the
exported subpath build. See [testing](testing.md) for the commands and benchmark
procedure.

A local test suite and synthetic validation do not establish device-wide latency
or real chat-client behavior. Keep peak process memory distinct from typed-array
allocation, and report hardware/runtime and corpus with timing results. Actual
Discord and WhatsApp paste/click verification remains a separate release check;
ASCII transport and an alphanumeric tail reduce known linkifier hazards without
guaranteeing every client behavior.
