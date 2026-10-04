# Priming checkpoints: deferred runtime option

This experiment preserves frozen ARX6 model version 2. It changes neither its predictions nor the wire. It asks whether a Worker can avoid repeating prior training without retaining an entire 50.45 MiB primed model.

The prototype stores one checkpoint keyed by the exact copied prior bytes and model factory identity. It compares a primed model with a fresh constructor, records changed typed-array cells as sparse runs, and clones scalar/nested state. A uniform Uint32 scan improves capture time. The compressed variant packs those runs and uses the existing `fflate` dependency at level 1; the alternative retains the runs directly. Neither variant retains artifact bodies or an entire primed model. The checkpoint is process-local and is not an interoperable file format.

All four primed variants (`m`, `c`, `j`, `s`) pass full restored-state equality, exact v2 wire equality, restored-model decode, and ordinary-model decode. The production model source is unchanged and pinned in the results. The general serializer makes no assumption about array lengths, but remains coupled to the model's runtime object structure; a future model requires its own factory identity and equivalence proof.

## Observed tradeoff

The initial independent-process comparison used a small Markdown envelope, a forced `m` prior, and six generation/preview pairs. Module imports and pinned asset loading precede timing; explicit garbage collection precedes each pair. Peak RSS is the maximum reported by the process over all six pairs, not retained checkpoint size.

| Mode | Retained checkpoint | First encode | First encode + immediate preview | Later pair range | Peak process RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Existing priming | 0 | 420 ms | 763 ms | 750–781 ms | 153 MiB |
| Compressed checkpoint | 3.30 MiB | 823 ms | 971 ms | 233–294 ms | 212 MiB |
| Uncompressed sparse runs | 8.89 MiB | 548 ms | 603 ms | 99–119 ms | 166 MiB |

The portable replay also passed every equivalence check. Its first-pair times were 901 ms / 1,190 ms / 639 ms respectively, with peak RSS 155 / 202 / 168 MiB. The same qualitative tradeoff survived that replay. These are single ordered runs on the research host, with other research sharing the machine; they are not randomized performance estimates or browser/mobile guarantees.

Compressed curated checkpoints fit the initial 4 MiB retention goal (3.10–3.30 MiB for `j`/`c`/`m`), but capture and compression make the common first-generation/preview pair slower. Restoring the small shared `s` prior is slower than training it even after the cache exists. Retaining uncompressed runs does improve both the first pair and repeated pairs, at a larger memory cost.

The default ARX6 encoder also tests unprimed `n`; if that wins, the preview does not need the captured primed state. The Worker shuts down after 15 idle seconds and cancellation terminates it, discarding a checkpoint. Those lifecycle effects reduce how often later-operation savings can repay capture work.

No priming cache is integrated. The compressed approach regresses first-use latency and peak memory; the uncompressed approach remains a useful future option if a roughly 9 MiB bounded cache is acceptable and browser measurements justify the added state-management complexity. This is a tradeoff, not evidence that all checkpoint caching is ineffective.

## Reproduce

From the repository root:

```sh
node experiments/arx6/extra-checkpoint.mjs /tmp/arx6-checkpoint-replay.json
```

The driver creates and removes an isolated temporary bundle exposing existing codec internals, runs each timing mode in a separate Node process, then repeats full-state and wire proofs for all four priors. It writes no model snapshot or production source. The archived [results](extra-checkpoint-results.json) include original per-prior timings, typed-array change sizes, original process measurements, and the portable replay. Reproduction uses the frozen v2 model even when the app defaults to v3.
