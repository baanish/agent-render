# ARX4 kind-specific dictionaries

_Experimental notes from `scripts/bench-arx4-kind-dicts.mjs`. Not a shipped codec._

## The question

> Worth spending one char to potentially save thousands?

Two separate questions:

1. **Do kind-tuned substitution dicts beat the shared ARX3 dict** on held-out (LOO) fixtures?
2. **What does selection cost on the wire?**

### Tag-cost menu (you often pay **zero**)

| Selector | Extra fragment chars | Notes |
| --- | ---: | --- |
| **Free kind tags** (`m` md, `k` code, `j` json, `s` csv, `f` diff, …) | **0** | Unused RFC-3986 unreserved tags; same length as today’s `c` |
| `c` + 1 selector digit/byte | **+1** | Only needed if you refuse new tags |
| Infer from envelope kind | **0** | Kind already in tuple — but decode must learn kind *before* reversing kind-substitution (peek or staged decode) |

So: **do not spend a char unless free tags are off the table.** The interesting bar is
`kindDictBmp < arx3Bmp` (free tag) or `kindDictBmp + 1 < arx3Bmp` (+1 selector).

“Save thousands” is the wrong unit for Discord: one BMP char ≈ 2 brotli bytes.
A kind dict that saves **tens to hundreds** of BMP chars is already a real Discord win;
thousands of BMP chars would mean megabytes of source, which agents should **split**
semantically (see skill), not mosaic.

## Method

- Baseline: ARX3 path (tuple JSON → arx2 overlay → v1 dict → Brotli q11 → baseBMP chars).
- Kind overlay (**extra**): same path, then a third substitution layer from kind seeds +
  leave-one-out mined n-grams (max 64 slots, fresh `0x1d` code space).
- Kind replace: keep v1 singles + first 40 extended; replace the long English/JS tail with
  kind slots (same slot budget as today).
- LOO: mined patterns never see the measured fixture.

## Per-fixture results

| Fixture | kind | raw | ARX3 BMP | kind-extra BMP | kind-replace BMP | best free-tag | vs ARX3 | best +1 sel | vs ARX3 | slots |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| markdown-agents | markdown | 8000 | 205 | 207 (+1.0%) | 207 (+1.0%) | 207 | +1.0% | 208 | +1.5% | 64 |
| code-bench-report | markdown | 8314 | 1119 | 1116 (−0.3%) | 1119 (0.0%) | 1116 | −0.3% | 1117 | −0.2% | 64 |
| code-fragment | code | 8000 | 158 | 161 (+1.9%) | 159 (+0.6%) | 159 | +0.6% | 160 | +1.3% | 29 |
| json-package | json | 259 | 95 | 97 (+2.1%) | 102 (+7.4%) | 97 | +2.1% | 98 | +3.2% | 27 |
| csv-leaderboard | csv | 218 | 99 | 105 (+6.1%) | 108 (+9.1%) | 105 | +6.1% | 106 | +7.1% | 7 |
| diff-fragment | diff | 409 | 110 | 109 (−0.9%) | 109 (−0.9%) | 109 | −0.9% | 110 | 0.0% | 12 |
| small-markdown | markdown | 189 | 74 | 74 (0.0%) | 74 (0.0%) | 74 | 0.0% | 75 | +1.4% | 64 |

## Corpus totals

| Variant | Σ BMP | vs ARX3 |
| --- | ---: | ---: |
| ARX3 (shared dict) | 1860 | 0.0% |
| Kind dict, free tag | 1867 | +0.4% |
| Kind dict, +1 selector | 1874 | +0.8% |

Fixtures where free-tag kind dict beats ARX3: **2/7**
Fixtures where +1 selector still beats ARX3: **1/7**
Σ BMP chars saved (free tag): **-7** (+0.4%)
Σ BMP chars saved (+1 sel): **-14** (+0.8%)

## Sample kind slots (first 8, LOO)

- **markdown-agents** (markdown, 64 slots): `"\n## "`, `"\n### "`, `"\n#### "`, `"\n- "`, `"\n* "`, `"\n1. "`, `"\n2. "`, `"\n3. "`
- **code-bench-report** (markdown, 64 slots): `"\n## "`, `"\n### "`, `"\n#### "`, `"\n- "`, `"\n* "`, `"\n1. "`, `"\n2. "`, `"\n3. "`
- **code-fragment** (code, 29 slots): `"export async function "`, `"export default "`, `"import type "`, `" from \""`, `"type "`, `"=> {"`, `"): "`, `"?: "`
- **json-package** (json, 27 slots): `"\"name\":"`, `"\"version\":"`, `"\"private\":"`, `"\"scripts\":"`, `"\"dependencies\":"`, `"\"devDependencies\":"`, `"\"description\":"`, `"\"license\":"`
- **csv-leaderboard** (csv, 7 slots): `","`, `"\n"`, `"\""`, `"0,"`, `"1,"`, `"2,"`, `"3,"`
- **diff-fragment** (diff, 12 slots): `"--- a/"`, `"+++ b/"`, `"@@ -"`, `"\n+"`, `"\n-"`, `"\n "`, `"index "`, `"new file mode "`
- **small-markdown** (markdown, 64 slots): `"\n## "`, `"\n### "`, `"\n#### "`, `"\n- "`, `"\n* "`, `"\n1. "`, `"\n2. "`, `"\n3. "`

## Verdict

### Is +1 char worth it?

**Not on this corpus.** Kind dicts do not clearly beat shared ARX3 after LOO (Σ free-tag Δ +0.4%). Do not spend a selector char; do not ship kind tags yet without a larger held-out gate.

### Practical recommendation

1. **Prefer free kind tags over a +1 selector** if kind dicts ever clear a held-out gate.
   One char of framing is ~2 brotli bytes — tiny, but free is free, and unused tags exist.
2. **Do not expect “thousands” of chars saved** from dict specialization on Discord-sized
   payloads. Wins look like **tens of BMP chars** on kind-homogeneous artifacts, when they win.
3. **Agents should split oversized artifacts semantically** (skill guidance) — separate report
   sections / files — not mosaic reassembly protocols.
4. Next measurement gate: larger per-kind held-out corpus (real agent markdown vs TS vs
   package.json vs unified diffs). This bench’s LOO set is thin for csv/diff/json.

## Non-goals

- Not shipping kind tags or new dictionaries in this pass.
- Not updating AGENTS.md as if ARX4 ships.
- Not reviving mosaic assemblers.

## How to re-run

```bash
npm run bench:arx4-kind-dicts
# or: node scripts/bench-arx4-kind-dicts.mjs
```

_Generated in 169.1ms._
