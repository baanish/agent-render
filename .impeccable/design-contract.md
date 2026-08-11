# DESIGN CONTRACT — "Bench Instrument × Carbon Transfer" (fused world)

Authoritative grammar for the agent-render full rebuild. ONE token spine lives in `src/app/globals.css` `:root`/`.dark` (canonical colors + shared `--bench-*` aliases + shared keycap/recess depth recipe). `src/app/bench.css` holds only NEW grammar pieces and defines NO colors. Use only these tokens/classes; do not invent new colors or a second system.

## WORLD
Bone chrome in LIGHT theme; dark placard chrome in DARK theme (QRH grammar: charcoal panels, hairline etched rules, ivory ink); dark-charcoal content chassis (`--surface-code*`) in BOTH themes (code/diff/csv/json bodies stay dark). One orange COMMIT action. Functional keycap/recess depth only. No glow halos, no rounded cream cards, no radial-gradient washes, NO eyebrow/kicker above page headings, NO self-describing chrome text ("Decoded", "read-only codemirror", artifact-kind kicker duplicating filename/kind). Real footer (identity + license + links), never a stub.

## CLASS VOCABULARY (what to use)
- **Keycap button:** `.artifact-action` (+ `.is-primary` for the orange COMMIT). `.mono-pill` = shallower bone keycap tag. Do NOT use `.bench-key` (does not exist).
- **Recessed inputs:** `.creator-input`, `.creator-textarea`, `.creator-link-output` (already recessed). Do NOT use `.bench-slot`.
- **Density board (C4):** `.bench-board` (2px rule-strong border, bone bg) + `.bench-board-head` (dark engraved strip, `.bench-caps` label inside) + `.bench-cell` (hairline-separated cells). Do NOT invent board classes.
- **Field/segment chips:** `.bench-chip` + `.is-on` (selected orange) inside `.bench-chiprow`.
- **VFD readout (amber mono on dark slot):** `.bench-readout` — for budget chars / codec numbers.
- **D7 LED lamp:** `.bench-lamp` (+ `.is-amber` / `.is-red`) — tiny physical LED; only glow allowed.
- **D1 carbon-transfer (generated-link output ONLY):** `.bench-carbon-bar` (dashed strip, "the URL fragment is the carbon copy" with `<b>`), `.bench-stamp` (rotated red outline), `.bench-perf` (dashed tear line). Never tint the artifact body.
- **Engraved caps (mono uppercase labels):** `.bench-caps`.
- **Existing structural/layout classes already in use:** `.bench-hero`, `.bench-rig`, `.bench-col-creator`, `.bench-col-side`, `.bench-section` (+ `.bench-section-head`/`.bench-section-title`), `.bench-links` (+ `.bench-links-row`/`-kicker`/`-title`/`-desc`), `.site-footer`/`-wordmark`/`-nav`/`-link`, `.nav-bar`/`.nav-wordmark`/`.nav-text-link`, `.empty-state-layout`, `.stat-row`/`.stat-item`/`.stat-value`, `.metric-label`/`.metric-value`, `.artifact-disclosure*` , `.artifact-switcher*`, `.sample-link`, `.panel`, `.budget-track`/`.budget-fill`.

## PRESERVE (hard)
Every data-testid, data-active-kind, data-renderer-ready, data-diff-state, aria-*, element IDs, dynamic imports, lazy mounts, print-markdown attrs, print-hide-on-markdown, and ALL copy/product claims. Do not change behavior. Content bodies (CodeMirror, mermaid, csv table, json tree, markdown article) are NOT restyled.

## BANS (owner + craft-floor)
Eyebrow/kicker above a page heading. Self-describing chrome narration. Floating chrome / cream cards / radial washes / decorative glow. Section-number kickers unless the sequence IS the info. Footer stub. Monospace as costume (mono is for data/labels only).
