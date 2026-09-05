# ARX6 research import and deployment gates

Base revision: `72fb152e0cf92a11ff658c3b0dd3916b387f3e98`.

## Scope of this draft

This PR imports the executable, frozen general ARX6 codec, tests, and benchmark
glue under `experiments/arx6/`. **It does not implement viewer integration.**
The application protocol, default auto pool, UI, existing assets, dependencies,
and legacy decoders are unchanged. Experimental links are not yet shareable
through the deployed viewer. There are no server uploads or per-artifact fetches.

## Mechanism

The existing tuple pipeline JSON-escapes body newlines before the context mixer
sees them; substitutions can also create control bytes unrelated to source rows.
ARX6 codes a native tuple with raw WTF-8 strings instead. That preserves exact JS
strings, including lone surrogates, while exposing body rows to the existing
column expert. It adds causal previous-word / character-class contexts, a
syntax-conditioned residual mixer, and four-byte rather than seven-byte match
discovery. Direct low-order tables offset part of the additional allocation.

The wire is `#g1L<prior-id><base64url>`. All coding decisions use deterministic
integer arithmetic. It reuses the existing three 16 KiB curated priors, verifies
their SHA-256 identities, and copies caller-owned buffers at installation. A
CRC32 over the native frame is included in measured link lengths. No target
artifact is added to the priors.

## Historical measurements, not new production-baseline results

The original development set had 40 artifacts from 18 source groups. The model
was then frozen before evaluation on 93 artifacts from 47 disjoint source groups.
The source groups and artifact kinds are software-text proxies, not a measured
sample of actual agent traffic; samples within groups are correlated.

The historical baseline was the shorter of exact ARX5 entropy/base64url and
ARX2 with **Node Brotli q11**, not the complete production auto pool and not a
byte-identical validation of brotli-wasm. The new benchmark runner is designed to
close that gap; it has not yet supplied replacement numbers.

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
silently republished as MIT application fixtures in this PR. Supply a permitted,
independent corpus to the new runner, and report its results separately.

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

## Required before viewer integration / default enablement

- [ ] Reuse the canonical tuple helpers; validate reconstructed envelopes through
  the normal schema/normalization path and reconcile decoded/fragment budgets.
- [ ] Introduce versioned async encode/decode routing and a compact tag; keep all
  old tags and decoder bytes unchanged. Missing/skewed assets must be explicit,
  retryable decode failures, never guessed priors.
- [ ] Run CPU-bound encoding/decoding in a bounded Worker with cancellation and
  deliberate error handling; measure maximum-payload latency and peak memory.
- [ ] Compare the new candidate against the **complete** existing auto result,
  retaining legacy bytes on ties, losses, and candidate unavailability. Keep
  emission opt-in until independent real-agent data supports default enablement.
- [ ] Complete application/UI, asset-loading, TypeScript, lint, build, Chromium,
  WebKit, and live Discord/WhatsApp paste/click verification. Update the app docs,
  examples, codec pickers, and agent skill together when the protocol is wired in.

Current local evidence: the original prototype suite passed 20/20 groups; the
new repository-asset conformance runner passed 16/16 checks. The full application
suite, the new production-baseline benchmark, and browser integration were not
run in the authoring environment. A draft PR is intentional, not a claim of
production readiness.
