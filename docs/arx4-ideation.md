# ARX4 ideation — squeezing more into a Discord message

_Experimental notes from `scripts/arx4-ideation-probe.mjs`. Not a shipped codec._

## Goal

ARX3 already optimizes **visible fragment characters** via baseBMP (~15.92 bits/char).
Discord's hard limit is the full markdown link:

```text
[label](https://host/path#<tag><payload>)  ≤  2000 characters
```

So ARX4 should optimize **Discord markdown-link length**, not just fragment length.

## Discord budget math

| Framing | Framing overhead | Payload budget | Max brotli bytes @ baseBMP | Max @ baseAstral (code-point count) |
| --- | ---: | ---: | ---: | ---: |
| currentHost (`[Artifact](https://agent-render.com#c…)`) | 38 | 1962 | 3898 | 4897 |
| shortHost (`[a](https://arx.page#d…)`) | 23 | 1977 | 3928 | 4934 |
| bareHost (`[x](https://r.page#d…)`) | 21 | 1979 | 3932 | 4939 |

Takeaway: host + label overhead is only ~20–50 chars (and short labels are already the
agent skill default). The real ceiling is ~3.8–3.9 KB of compressed bytes under baseBMP.
Astral density (~4.9 KB) is not a Discord win under UTF-16 counting — see research note.

## Wire density ceiling

| Encoding | Bits / JS `length` unit | Notes |
| --- | ---: | --- |
| base64url | 6.00 | ASCII-safe; ARX2 default on hostile surfaces |
| base76 | 6.27 | ASCII fragment-safe |
| base1k | 10.79 | BMP subset |
| baseBMP (ARX3) | 15.92 | Current best visible density |
| baseAstral (code points) | 20.00 | ~26% denser **only if** Discord counts code points |
| baseAstral (UTF-16 units) | 10.00 | **Worse** than baseBMP (~10 vs ~15.92 bits/unit) |

### Research note — Discord length counting (2026-07 web pass)

Public sources disagree; the **client-facing** signal matters most for paste-to-send:

| Source | Claim | Weight |
| --- | --- | --- |
| TypeCount / Discord character-counter guides | Standard emoji count as **2** toward the 2000 limit ("Unicode encoding") | High for UX — matches JS/Electron `.length` |
| Discord desktop stack | Electron → JS strings → UTF-16 code units | High — composer counter almost certainly uses this |
| Our product (`markdown-link.ts`) | Already gates on `markdownLink.length` (UTF-16 units) | Aligns with client-side folk wisdom |
| twilight-interactions #41 | Slash-command option `min/max_length` uses Unicode **code points** (Python `len()`), not UTF-8 bytes | Medium — different API surface than message `content` |
| Secondary blogs (go-tools, discord-webhook) | "Code points, emoji = 1" | Low — contradicted by emoji=2 guides; some validators still use JS `.length` |

**Working conclusion:** treat Discord message limits as **UTF-16-unit** (JS `.length`) until a live paste test proves otherwise.
That **kills baseAstral as a Discord win** — astral scalars cost 2 units each, so density drops below baseBMP.
Keep a one-shot paste test on the backlog (1999 BMP chars vs 1000 astral + framing) only to close the API-vs-client gap; do not prototype baseAstral for Discord first.

## Ideas probed

1. **baseAstral wire** — pack into supplementary-plane scalars (~20 bits/code point). **Deprioritized for Discord** after UTF-16 research.
2. **CBOR-ish binary tuple** — drop JSON quotes/escapes around the ARX2/3 tuple. **Worth exploring.**
3. **Brotli shared static dictionary** — seed Brotli with domain patterns already in `/arx-dictionary.json`.
   Node zlib cannot set a Brotli custom dictionary today, so the probe reports (a) a residual
   `brotli(dict‖data)−brotli(dict)` estimate and (b) a real `deflateRaw+dictionary` proxy. **Worth exploring** via wasm.
4. **Content-first binary envelope** — compress raw artifact bytes + tiny binary header, skip JSON entirely. **Worth exploring.**
5. **Mined overlay growth** — corpus-mined n-grams as an extra substitution layer.
6. **Combined ARX4 stack** — content-first + mined + shared-dict estimate.
7. **Discord framing** — short host + 1-char label + compact tag. **Already practiced** (skill uses short labels; host shortening is DNS, not codec).

## Corpus results

Visible char counts assume the ARX3-style compact tag + dense Unicode wire (marker + 2-char length + digits).
Percentages are vs ARX3 baseBMP visible chars (negative = larger / worse).

### Brotli bytes

| Fixture | raw chars | ARX3 (baseline) | ARX3 + Brotli dict est. | ARX3 deflate+dict proxy | CBOR tuple + Brotli | CBOR + Brotli dict est. | Content-first binary | Content-first + dict est. | ARX3 + mined overlay | Content-first + mined | ARX4 stack (cf+mined+dict) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markdown-agents | 8,000 | 401 (0.0%) | 351 (−12.5%) | 471 (+17.5%) | 392 (−2.2%) | 337 (−16.0%) | 395 (−1.5%) | 342 (−14.7%) | 405 (+1.0%) | 398 (−0.7%) | 363 (−9.5%) |
| code-bench-report | 8,314 | 2219 (0.0%) | 2188 (−1.4%) | 2624 (+18.3%) | 2208 (−0.5%) | 2169 (−2.3%) | 2219 (0.0%) | 2171 (−2.2%) | 2296 (+3.5%) | 2285 (+3.0%) | 2241 (+1.0%) |
| code-fragment | 8,000 | 308 (0.0%) | 272 (−11.7%) | 360 (+16.9%) | 300 (−2.6%) | 255 (−17.2%) | 308 (0.0%) | 261 (−15.3%) | 322 (+4.5%) | 320 (+3.9%) | 286 (−7.1%) |
| json-package | 259 | 182 (0.0%) | 141 (−22.5%) | 184 (+1.1%) | 173 (−4.9%) | 129 (−29.1%) | 184 (+1.1%) | 131 (−28.0%) | 190 (+4.4%) | 192 (+5.5%) | 150 (−17.6%) |
| small-markdown | 189 | 141 (0.0%) | 110 (−22.0%) | 160 (+13.5%) | 160 (+13.5%) | 103 (−27.0%) | 163 (+15.6%) | 108 (−23.4%) | 154 (+9.2%) | 178 (+26.2%) | 118 (−16.3%) |

### Visible chars @ baseBMP

| Fixture | ARX3 BMP | best idea BMP | win | fits Discord (current host) | fits (short host) |
| --- | ---: | ---: | ---: | :---: | :---: |
| markdown-agents | 205 | 173 (CBOR + Brotli dict est.) | −15.6% | yes → yes | yes |
| code-bench-report | 1119 | 1093 (CBOR + Brotli dict est.) | −2.3% | yes → yes | yes |
| code-fragment | 158 | 132 (CBOR + Brotli dict est.) | −16.5% | yes → yes | yes |
| json-package | 95 | 68 (CBOR + Brotli dict est.) | −28.4% | yes → yes | yes |
| small-markdown | 74 | 55 (CBOR + Brotli dict est.) | −25.7% | yes → yes | yes |

### Visible chars @ baseAstral (optimistic code-point counting)

| Fixture | ARX3 BMP | ARX3 Astral | best idea Astral | astral win vs ARX3 BMP |
| --- | ---: | ---: | ---: | ---: |
| markdown-agents | 205 | 164 | 138 (CBOR + Brotli dict est.) | −32.7% |
| code-bench-report | 1119 | 891 | 871 (CBOR + Brotli dict est.) | −22.2% |
| code-fragment | 158 | 127 | 106 (CBOR + Brotli dict est.) | −32.9% |
| json-package | 95 | 76 | 55 (CBOR + Brotli dict est.) | −42.1% |
| small-markdown | 74 | 60 | 45 (CBOR + Brotli dict est.) | −39.2% |

### Totals (fixtures with a value for that variant)

| Variant | Σ brotli | Σ BMP chars | vs ARX3 BMP | Σ Astral chars | vs ARX3 BMP |
| --- | ---: | ---: | ---: | ---: | ---: |
| ARX3 (baseline) | 3251 | 1651 | 0.0% | 1318 | −20.2% |
| ARX3 + Brotli dict est. | 3062 | 1556 | −5.8% | 1243 | −24.7% |
| ARX3 deflate+dict proxy | 3799 | 1926 | +16.7% | 1538 | −6.8% |
| CBOR tuple + Brotli | 3233 | 1641 | −0.6% | 1312 | −20.5% |
| CBOR + Brotli dict est. | 2993 | 1521 | −7.9% | 1215 | −26.4% |
| Content-first binary | 3269 | 1660 | +0.5% | 1326 | −19.7% |
| Content-first + dict est. | 3013 | 1531 | −7.3% | 1223 | −25.9% |
| ARX3 + mined overlay | 3367 | 1709 | +3.5% | 1365 | −17.3% |
| Content-first + mined | 3373 | 1713 | +3.8% | 1368 | −17.1% |
| ARX4 stack (cf+mined+dict) | 3158 | 1605 | −2.8% | 1282 | −22.4% |

## Discord capacity (how much raw text fits)

Binary-searching the largest source string whose encoded markdown link stays ≤ 2000 chars
(current-host framing, payload budget 1962) shows the practical ceiling:

| Content shape | ARX3 @ baseBMP | ARX3 @ baseAstral | Content-first @ BMP | Notes |
| --- | ---: | ---: | ---: | --- |
| Tiled real report + unique headers | ≥120k (search cap) | ≥150k (~+25%) | ≥120k | Highly compressible; Discord is not the bottleneck |
| Generated TS helpers | ≥120k (search cap) | ≥150k (~+25%) | ≥120k | Same |
| Quote/newline-heavy prose | ~88k | ~112k (~+27%) | ~87k | JSON escaping barely matters once Brotli runs |
| Current `code-bench-report.md` (8.3k) | ~1117 BMP chars | ~891 astral | ~1117 | Uses ~57% of Discord budget today |

**Reading:** for Discord, ARX3 already leaves a lot of headroom on typical artifacts. With
baseAstral deprioritized (UTF-16), the ways to *raise the ceiling* are fewer compressed
bytes via shared dictionaries / better envelopes — not denser Unicode wire or more text substitutions.

## Interpretation

### What already works in ARX3

- For typical single artifacts under ~8–12 KB of source, ARX3 baseBMP already fits Discord
  with room to spare (see `small-markdown`, `json-package`, `code-fragment`, and the
  8.3k code-bench report at ~57% of budget).
- The painful case is large unique prose/reports where dictionary substitution helps less
  and Brotli carries most of the work — chase bytes there, not astral wire.

### Ranked bets for ARX4

1. **Mosaic / multi-message assembler — top “break the box” bet (see `docs/arx4-silly-cuts.md`)**
   - Only lever that *multiplies* Discord’s 2000 budget (N messages ≈ N× capacity).
   - N links in *one* message do not help — they share the same 2000 chars.
   - Protocol + UX cost (click/`1/3` assembly); not a denser alphabet.

2. **Content-first / CBOR + real Brotli shared dict — explored (see `docs/arx4-bet2-bench.md`)**
   - Implemented: `src/lib/payload/arx4-content-first.ts` + `npm run bench:arx4-bet2`.
   - Residual dict estimates overstated wins (~6–8% corpus); **real `brotli -D` is ~0–1%**.
   - Binary envelopes alone are not a Discord unlock; keep as plumbing, not the next capacity bet.
   - Browser shared-dict still blocked (`brotli-wasm` has no dict API; Node zlib ignores it).

3. **Versioned shared prior (chunk / word) — only with LOO gate**
   - Warm/contaminated priors look magical (−70%+) and are fake (content-addressed cache).
   - Leave-one-out chunk priors **regressed** this corpus (~+20% BMP) — literals + ID framing lose to ARX3+Brotli.
   - Revisit only for a *domain* prior that LOO-beats ARX3 on held-out agent chat; never trust warm numbers.

4. **Implied envelope + kind IR + lossy — small honest cuts**
   - Implied / kind IR ~3–4% corpus; lossy ~8% when stripping emphasis/comments.
   - Plumbing / opt-in preview — not a Discord unlock alone.

5. **Hybrid fence / label bitstream — wash**
   - Fence stub steals budget; label-as-title costs framing. Skip as density bets; fence may still be a paste UX.

6. **Curated overlay growth (cautious)**
   - Alone, mined n-grams *regressed* this corpus (+3–4%).

7. **baseAstral — deprioritized for Discord**
   - UTF-16 client counting → astral loses to baseBMP (~10 vs ~15.92 bits/unit).

8. **Discord framing — already practiced, not an ARX4 lever**
   - Short labels are skill default; host shortening is DNS, not codec.

### Suggested ARX4 shape (if pursued)

```text
# Single-link path (marginal):
artifact bytes
  → implied / content-first envelope + optional kind IR
  → Brotli q11 (+ real shared dict only if browser wasm gains dict support)
  → baseBMP → compact tag

# Break-the-box path (capacity):
artifact bytes → ARX3/ARX4 pack → split into N Discord messages (mosaic 1/N)
  OR stub link + ```arx fence (paste UX, not denser wire)
```

Selection policy: optimize `markdownLink.length` (JS/UTF-16 units) for a declared surface
(`discord` | `discord-mosaic` | `discord-fence` | `visible` | `transport`).

Silly-cuts takeaway: **stop chasing alphabet / residual-dict / contaminated priors.**
The real unlock is either a proven LOO prior or accepting multi-message / fence UX.

## Non-goals / traps

- Do not weaken the 8192 fragment budget or 200k decoded budget for Discord wins.
- Do not put artifact bodies in query params.
- Do not chase baseAstral for Discord until a live paste test overturns UTF-16 counting.
- Do not treat short-host framing as an ARX4 deliverable.
- Do not replace UUID mode: hostile link scanners still want short opaque URLs.
- Do not grow substitution dictionaries without a corpus gate — mining can regress.

## How to re-run

```bash
npm run bench:arx4-ideation
# or: node scripts/arx4-ideation-probe.mjs

# Bet #2 follow-up (content-first/CBOR + real brotli -D):
npm run bench:arx4-bet2

# Silly / deep cuts (priors, IR, mosaic, fence):
npm run bench:arx4-silly
```

_Generated in 9.6ms._
See also `docs/arx4-bet2-bench.md` and `docs/arx4-silly-cuts.md`.
