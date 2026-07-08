# ARX4 bet #2 — content-first / CBOR + real Brotli shared dictionary

_Experimental bench from `scripts/bench-arx4-bet2.mjs`. Not a shipped codec._

## What was implemented

1. **Content-first binary envelope** — `src/lib/payload/arx4-content-first.ts`
   - Wire: `A4 | version | kind | id | content | meta`
   - Round-trip tested; stamps rebuilt envelopes as `codec: "plain"` (ARX4 is not shipped).
2. **CBOR-ish tuple encoder** — same module; encodes the ARX2/3 tuple without JSON quotes.
3. **Real Brotli shared dictionary** — measured via system `brotli -D` (LZ77 raw dictionary).
   - Node `zlib.brotliCompressSync({ dictionary })` **silently ignores** the option on Node 22.
   - Product `brotli-wasm@3` has **no** custom-dictionary API.
   - Residual `brotli(dict‖data)−brotli(dict)` is kept only as a calibration column.

## Environment

- Node: `v22.14.0`
- Brotli CLI available: **yes**
- Shared dictionary size: **1143** bytes (ARX slot text + scaffolding)
- Discord framing budget (current host): **1962** payload chars

## Pre-compress sizes (envelope bytes before Brotli)

| Fixture | ARX3 substituted | CBOR | CBOR+text-sub | Content-first | CF+text-sub |
| --- | ---: | ---: | ---: | ---: | ---: |
| markdown-agents | 6871 | 8056 | 7006 | 8050 | 7000 |
| code-bench-report | 8203 | 8373 | 8360 | 8366 | 8353 |
| code-fragment | 7278 | 8065 | 7037 | 8063 | 7070 |
| json-package | 346 | 308 | 294 | 307 | 294 |
| small-markdown | 183 | 217 | 186 | 225 | 204 |

## Brotli bytes (q11) vs ARX3

| Fixture | raw chars | ARX3 (baseline) | ARX3 + residual dict est. | ARX3 + real Brotli −D | ARX3 deflate+dict (non-goal) | CBOR tuple + Brotli | CBOR + text-sub + Brotli | CBOR + real Brotli −D | CBOR + text-sub + real −D | Content-first + Brotli | Content-first + text-sub + Brotli | Content-first + real −D | Content-first + text-sub + real −D | Best real bet #2 candidate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markdown-agents | 8,000 | 401 (0.0%) | 351 (−12.5%) | 380 (−5.2%) | 471 (+17.5%) | 392 (−2.2%) | 397 (−1.0%) | 385 (−4.0%) | 379 (−5.5%) | 399 (−0.5%) | 403 (+0.5%) | 390 (−2.7%) | 387 (−3.5%) | 379 (−5.5%) |
| code-bench-report | 8,314 | 2219 (0.0%) | 2188 (−1.4%) | 2219 (0.0%) | 2624 (+18.3%) | 2208 (−0.5%) | 2209 (−0.5%) | 2202 (−0.8%) | 2206 (−0.6%) | 2217 (−0.1%) | 2222 (+0.1%) | 2217 (−0.1%) | 2219 (0.0%) | 2202 (−0.8%) |
| code-fragment | 8,000 | 308 (0.0%) | 272 (−11.7%) | 307 (−0.3%) | 360 (+16.9%) | 300 (−2.6%) | 296 (−3.9%) | 314 (+1.9%) | 290 (−5.8%) | 311 (+1.0%) | 310 (+0.6%) | 317 (+2.9%) | 299 (−2.9%) | 290 (−5.8%) |
| json-package | 259 | 182 (0.0%) | 141 (−22.5%) | 188 (+3.3%) | 184 (+1.1%) | 173 (−4.9%) | 173 (−4.9%) | 177 (−2.7%) | 177 (−2.7%) | 190 (+4.4%) | 182 (0.0%) | 181 (−0.5%) | 183 (+0.5%) | 177 (−2.7%) |
| small-markdown | 189 | 141 (0.0%) | 110 (−22.0%) | 143 (+1.4%) | 160 (+13.5%) | 160 (+13.5%) | 140 (−0.7%) | 144 (+2.1%) | 142 (+0.7%) | 184 (+30.5%) | 155 (+9.9%) | 177 (+25.5%) | 154 (+9.2%) | 142 (+0.7%) |

## Visible chars @ baseBMP vs ARX3

| Fixture | ARX3 (baseline) | ARX3 + residual dict est. | ARX3 + real Brotli −D | ARX3 deflate+dict (non-goal) | CBOR tuple + Brotli | CBOR + text-sub + Brotli | CBOR + real Brotli −D | CBOR + text-sub + real −D | Content-first + Brotli | Content-first + text-sub + Brotli | Content-first + real −D | Content-first + text-sub + real −D | Best real bet #2 candidate | fits Discord? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| markdown-agents | 205 (0.0%) | 180 (−12.2%) | 194 (−5.4%) | 240 (+17.1%) | 200 (−2.4%) | 203 (−1.0%) | 197 (−3.9%) | 194 (−5.4%) | 204 (−0.5%) | 206 (+0.5%) | 199 (−2.9%) | 198 (−3.4%) | 194 (−5.4%) | yes |
| code-bench-report | 1119 (0.0%) | 1103 (−1.4%) | 1119 (0.0%) | 1322 (+18.1%) | 1113 (−0.5%) | 1114 (−0.4%) | 1110 (−0.8%) | 1112 (−0.6%) | 1118 (−0.1%) | 1120 (+0.1%) | 1118 (−0.1%) | 1119 (0.0%) | 1110 (−0.8%) | yes |
| code-fragment | 158 (0.0%) | 140 (−11.4%) | 158 (0.0%) | 184 (+16.5%) | 154 (−2.5%) | 152 (−3.8%) | 161 (+1.9%) | 149 (−5.7%) | 160 (+1.3%) | 159 (+0.6%) | 163 (+3.2%) | 154 (−2.5%) | 149 (−5.7%) | yes |
| json-package | 95 (0.0%) | 74 (−22.1%) | 98 (+3.2%) | 96 (+1.1%) | 90 (−5.3%) | 90 (−5.3%) | 92 (−3.2%) | 92 (−3.2%) | 99 (+4.2%) | 95 (0.0%) | 94 (−1.1%) | 95 (0.0%) | 92 (−3.2%) | yes |
| small-markdown | 74 (0.0%) | 59 (−20.3%) | 75 (+1.4%) | 84 (+13.5%) | 84 (+13.5%) | 74 (0.0%) | 76 (+2.7%) | 75 (+1.4%) | 96 (+29.7%) | 81 (+9.5%) | 92 (+24.3%) | 81 (+9.5%) | 75 (+1.4%) | yes |

## Totals (all fixtures)

| Variant | Σ brotli | vs ARX3 | Σ BMP chars | vs ARX3 BMP |
| --- | ---: | ---: | ---: | ---: |
| ARX3 (baseline) | 3251 | 0.0% | 1651 | 0.0% |
| ARX3 + residual dict est. | 3062 | −5.8% | 1556 | −5.8% |
| ARX3 + real Brotli −D | 3237 | −0.4% | 1644 | −0.4% |
| ARX3 deflate+dict (non-goal) | 3799 | +16.9% | 1926 | +16.7% |
| CBOR tuple + Brotli | 3233 | −0.6% | 1641 | −0.6% |
| CBOR + text-sub + Brotli | 3215 | −1.1% | 1633 | −1.1% |
| CBOR + real Brotli −D | 3222 | −0.9% | 1636 | −0.9% |
| CBOR + text-sub + real −D | 3194 | −1.8% | 1622 | −1.8% |
| Content-first + Brotli | 3301 | +1.5% | 1677 | +1.6% |
| Content-first + text-sub + Brotli | 3272 | +0.6% | 1661 | +0.6% |
| Content-first + real −D | 3282 | +1.0% | 1666 | +0.9% |
| Content-first + text-sub + real −D | 3242 | −0.3% | 1647 | −0.2% |
| Best real bet #2 candidate | 3190 | −1.9% | 1620 | −1.9% |

## Findings

### Content-first / CBOR alone

- Dropping JSON (CBOR) or skipping the tuple (content-first) changes pre-Brotli size, but
  **after Brotli q11 the win vs ARX3 is small** — often within ~1%, and content-first alone
  can *lose* on small fixtures because it skips ARX text substitution.
- Re-applying v1 text substitution *inside* content-first / CBOR fields recovers most of
  that gap; see the `+ text-sub` columns.

### Real Brotli shared dictionary (`brotli -D`)

- Unlike the residual estimate (often −10% to −30%), **real LZ77 shared dictionaries are
  modest** on this corpus (typically under ~1% total, fixture-dependent).
- Residual estimates systematically **overstate** the win; do not use them as a ship gate.
- Deflate+dictionary remains a **non-goal**: larger than plain Brotli on this corpus.

### Product implications

1. **Browser path blocked for real shared dicts today** — `brotli-wasm` has no dictionary
   API; Node zlib ignores `dictionary`. Shipping ARX4 shared-dict needs a wasm fork or
   alternate compressor with custom-dict support.
2. **Binary envelopes are still useful plumbing** (no JSON escaping, cleaner wire) but are
   not a Discord capacity unlock by themselves on this corpus.
3. Prefer measuring with **real `brotli -D`** (or a dict-capable wasm) over residual proxies
   before committing to a shared-dictionary protocol.
4. Next exploration should focus on **dict contents matched to the post-substitution byte
   stream** (or a wasm dict path), not more residual optimism.

## How to re-run

```bash
# requires system `brotli` CLI for real −D columns (apt install brotli)
npm run bench:arx4-bet2
# or: node scripts/bench-arx4-bet2.mjs
```

_Generated in 292.4ms._
