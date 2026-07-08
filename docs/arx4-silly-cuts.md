# ARX4 silly cuts — unconventional Discord packing

_Experimental notes from `scripts/bench-arx4-silly.mjs`. Not a shipped codec._

## Why this pass

Bet #2 (binary envelopes + real Brotli `-D`) topped out around **~0–2%** vs ARX3.
Wire density is already ~99.5% of the 16-bit UTF-16 ceiling. Alphabet and residual-dict
tweaks are exhausted. This pass looks for **deeper / sillier** levers:

- shared priors the *viewer already knows* (chunks, word tables, templates)
- kind-specific IR and lossy readable-enough transforms
- Discord UX bends (mosaic links, fence hybrid, label-as-bitstream)
- implied envelopes that drop metadata from the fragment

## Ideas measured

| Cut | Idea | Lossless? | Product tension |
| --- | --- | :---: | --- |
| A | **Implied envelope** — 1-byte kind + raw content | yes | drops id/title/filename from fragment |
| B | **Kind IR** — md normalize / JSON key-dict / CSV columnar | mostly | kind-specific decoders |
| C | **Chunk prior** — CDC-ish windows → 2-byte IDs vs shared prior | yes* | prior must be pinned/versioned |
| D | **Template delta** — strip known skeleton, store residual+marks | yes* | skeleton catalog |
| E | **Lossy readable** — collapse ws, strip emphasis/comments | no | quality trade |
| F | **Label bitstream** — put title in Discord `[label]` | yes | label UX / length |
| G | **Mosaic** — N markdown links / N messages | yes | multi-click UX |
| H | **Hybrid fence** — stub URL + ` ```arx ` payload in same message | yes | not pure-link; scanners differ |
| I | **Word pack** — corpus BPE-ish token table → id stream | yes* | shared vocab |

\* Lossless only if encoder and decoder share the same prior/vocab/skeleton version.

Prior sizes this run: cold chunks **77**, warm chunks **7061**, cold words **15**, warm words **312**.
Leave-one-out (LOO) priors exclude the measured fixture — that is the honest “pinned mother dict” estimate.

## Per-fixture Brotli bytes (vs ARX3)

| Fixture | raw | ARX3 | implied | kind IR | chunk cold | chunk LOO | chunk warm† | word LOO | lossy | silly stack (IR+LOO) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markdown-agents | 8000 | 401 | 370 (−7.7%) | 371 (−7.5%) | 654 (+63.1%) | 654 (+63.1%) | 274 (−31.7%) | 461 (+15.0%) | 371 (−7.5%) | 657 (+63.8%) |
| code-bench-report | 8314 | 2219 | 2180 (−1.8%) | 2181 (−1.7%) | 2484 (+11.9%) | 2484 (+11.9%) | 319 (−85.6%) | 2667 (+20.2%) | 2143 (−3.4%) | 2474 (+11.5%) |
| code-fragment | 8000 | 308 | 292 (−5.2%) | 292 (−5.2%) | 516 (+67.5%) | 516 (+67.5%) | 284 (−7.8%) | 305 (−1.0%) | 195 (−36.7%) | 516 (+67.5%) |
| json-package | 259 | 182 | 162 (−11.0%) | 172 (−5.5%) | 181 (−0.5%) | 181 (−0.5%) | 25 (−86.3%) | 186 (+2.2%) | 162 (−11.0%) | 187 (+2.7%) |
| csv-leaderboard | 218 | 191 | 156 (−18.3%) | 174 (−8.9%) | 172 (−9.9%) | 149 (−22.0%) | 29 (−84.8%) | 173 (−9.4%) | 156 (−18.3%) | 151 (−20.9%) |
| small-markdown | 189 | 141 | 135 (−4.3%) | 135 (−4.3%) | 133 (−5.7%) | 136 (−3.5%) | 32 (−77.3%) | 153 (+8.5%) | 135 (−4.3%) | 136 (−3.5%) |

† **chunk warm** includes the target fixture in the prior — contamination ceiling, not a real win.

## Per-fixture visible BMP chars (vs ARX3)

| Fixture | ARX3 BMP | implied | kind IR | chunk LOO | word LOO | lossy | best honest | Discord fit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| markdown-agents | 205 | 189 (−7.8%) | 190 (−7.3%) | 332 (+62.0%) | 235 (+14.6%) | 190 (−7.3%) | 189 (−7.8%) | yes |
| code-bench-report | 1119 | 1099 (−1.8%) | 1099 (−1.8%) | 1252 (+11.9%) | 1344 (+20.1%) | 1080 (−3.5%) | 1099 (−1.8%) | yes |
| code-fragment | 158 | 150 (−5.1%) | 150 (−5.1%) | 263 (+66.5%) | 157 (−0.6%) | 101 (−36.1%) | 150 (−5.1%) | yes |
| json-package | 95 | 85 (−10.5%) | 90 (−5.3%) | 94 (−1.1%) | 97 (+2.1%) | 85 (−10.5%) | 85 (−10.5%) | yes |
| csv-leaderboard | 99 | 82 (−17.2%) | 91 (−8.1%) | 78 (−21.2%) | 90 (−9.1%) | 82 (−17.2%) | 78 (−21.2%) | yes |
| small-markdown | 74 | 71 (−4.1%) | 71 (−4.1%) | 72 (−2.7%) | 80 (+8.1%) | 71 (−4.1%) | 71 (−4.1%) | yes |

## Corpus totals

| Variant | Σ brotli | Σ BMP | vs ARX3 BMP |
| --- | ---: | ---: | ---: |
| ARX3 (baseline) | 3442 | 1750 | 0.0% |
| A implied envelope | 3295 | 1676 | −4.2% |
| B kind IR | 3325 | 1691 | −3.4% |
| C chunk cold (dict only) | 4140 | 2101 | +20.1% |
| C chunk LOO (pinned, held-out) | 4120 | 2091 | +19.5% |
| C chunk warm† (contaminated) | 963 | 505 | −71.1% |
| D template delta | 3670 | 1864 | +6.5% |
| E lossy readable | 3162 | 1609 | −8.1% |
| I word cold | 3496 | 1777 | +1.5% |
| I word LOO | 3945 | 2003 | +14.5% |
| I word warm† | 3267 | 1662 | −5.0% |
| B+C silly stack (IR+LOO) | 4121 | 2092 | +19.5% |

## Discord UX bends (not pure single-fragment)

### F — Label as bitstream

Moving the title into `[label]` saves a little payload but costs framing chars.
Net is usually a wash or a loss for short titles; only interesting for long titles
that Brotli would not have collapsed much.

| Fixture | short label | framing Δ | approx payload BMP saved | net Discord Δ |
| --- | --- | ---: | ---: | ---: |
| markdown-agents | `AGENTS.md excerpt` | +16 | ~3 | +13 |
| code-bench-report | `Baanish Code Bench` | +17 | ~4 | +13 |
| code-fragment | `fragment.ts excerpt` | +18 | ~4 | +14 |
| json-package | `package.json` | +11 | ~3 | +8 |
| csv-leaderboard | `Leaderboard` | +10 | ~3 | +7 |
| small-markdown | `Note` | +3 | ~2 | +1 |

### G — Mosaic multipart

Each Discord message still caps at 2000. Multiple messages multiply capacity;
multiple links *in one message* mostly fight over the same 2000 budget.

| Fixture | ARX3 BMP | parts if separate msgs | parts fitting one msg | 1-msg capacity |
| --- | ---: | ---: | ---: | ---: |
| markdown-agents | 205 | 1 | 1 | 205 |
| code-bench-report | 1119 | 1 | 1 | 1119 |
| code-fragment | 158 | 1 | 1 | 158 |
| json-package | 95 | 1 | 1 | 95 |
| csv-leaderboard | 99 | 1 | 1 | 99 |
| small-markdown | 74 | 1 | 1 | 74 |

Unique-prose capacity ×3 separate messages (approx): **~169k** chars vs single-link **~56k**.

### H — Hybrid stub URL + code fence

Same Discord message: a tiny markdown link (deeplink / stub) plus a fenced payload.
Fence digits use the same BMP alphabet; overhead is fence markers, not URL framing.

| Stub link chars | Fence overhead | Fence payload budget | vs pure-link budget |
| ---: | ---: | ---: | ---: |
| 43 | 11 | 1945 | -24 |

| Fixture | ARX3 BMP | fits hybrid fence? | overflow |
| --- | ---: | :---: | ---: |
| markdown-agents | 205 | yes | 0 |
| code-bench-report | 1119 | yes | 0 |
| code-fragment | 158 | yes | 0 |
| json-package | 95 | yes | 0 |
| csv-leaderboard | 99 | yes | 0 |
| small-markdown | 74 | yes | 0 |

## Discord capacity (unique prose, binary search)

Largest *index-salted* prose string whose encoded form fits one Discord message
(current-host framing). Unique salts stop Brotli from collapsing tiled repeats —
this is the hard case, not the highly-repetitive search-cap case.

| Approach | Max raw chars | vs ARX3 |
| --- | ---: | ---: |
| ARX3 single link | 56303 | 0.0% |
| A implied | 54618 | −3.0% |
| B kind IR | 54866 | −2.6% |
| C chunk cold | 33299 | −40.9% |
| C chunk pinned (fixtures prior) | 52085 | −7.5% |
| I word pinned | 35630 | −36.7% |
| E lossy | 54542 | −3.1% |
| H hybrid fence (ARX3 bytes) | 55281 | −1.8% |
| G mosaic ×3 messages (approx) | ~168909 | +200.0% |

## Interpretation — what actually moves the needle

### Still inside one fragment + one link

1. **Warm/contaminated chunk priors look magical (−70%+)** — ignore them. They prove only
   that *if the decoder already has the bytes, you can send IDs*. That is a content-addressed
   cache, not a compressor.
2. **Leave-one-out chunk priors** are the real test for a channel-pinned mother dict.
   Read the LOO column: wins only where fixtures share long windows with siblings
   (small JSON/CSV/notes against a prior that saw similar scaffolding). Unique reports
   (code-bench) should stay near ARX3 or regress once literals dominate.
3. **Cold priors (shipped ARX dict slots only)** rarely beat ARX3+Brotli — substitution
   already harvested that juice; re-encoding as chunk IDs adds framing.
4. **Implied envelope + kind IR** are small, honest wins (metadata / normalize). Worth
   keeping as plumbing if ARX4 happens; not a Discord unlock alone.
5. **Template delta** as implemented is weak — Brotli already eats repeated skeletons;
   a mark/residual scheme often *adds* overhead.
6. **Lossy** helps when emphasis/comments/alignment rows are noise. Product call, not codec magic.
7. **Word pack LOO** is milder than chunks; useful only with a large shared vocab that
   actually overlaps the target (code keywords, markdown chrome).

### Break-the-box (Discord UX)

8. **Mosaic across messages** is the only lever that *multiplies* the 2000 budget.
   One message with N links does **not** — they share the same 2000 chars.
9. **Hybrid fence** is usually a wash or slight loss vs pure-link (stub steals budget);
   it is interesting only as a *paste UX* agents already use, not as denser packing.
10. **Label bitstream** is mostly a wash. Skip.

### Ranked silly bets (after this probe)

1. **Mosaic assembler** — **deprioritized** (prefer agent semantic splits via skill).
2. **Versioned shared prior** — only if LOO / held-out benches still win on *your* domain
   corpus (agent-render chat is repetitive; arbitrary user prose is not). Pair with a
   pinned mother post or build-shipped prior — never trust warm numbers.
3. **Kind-specific dicts** — free tags preferred over +1 selector; needs larger LOO corpus
   (current probe did not beat ARX3 — see `docs/arx4-kind-dicts.md`).
4. **Hybrid fence profile** — optional surface for agents that already paste code blocks;
   protocol bend, not a density win.
5. **Implied + kind IR** — cheap plumbing alongside a real prior story.
6. **Lossy mode** — opt-in “readable enough” chat previews.
7. Avoid more residual-Brotli-dict optimism, alphabet retunes, and contaminated prior benches.

## Non-goals reinforced

- Do not pretend corpus-trained priors generalize without a held-out / LOO gate.
- Do not put artifact bodies in query params or require a backend for the core path.
- Do not treat mosaic/fence as drop-in replacements for zero-click single links.
- Do not update AGENTS.md / skills as if ARX4 ships.

## How to re-run

```bash
npm run bench:arx4-silly
# or: node scripts/bench-arx4-silly.mjs
```

_Generated in 387.5ms._
See also `docs/arx4-ideation.md` and `docs/arx4-bet2-bench.md`.
