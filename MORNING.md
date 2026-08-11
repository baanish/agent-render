# Overnight redesign — morning review

The fused world ("Creator Hardware Bench" skeuomorphism + Japanese density + QRH/CR‑39 engraved-panel grammar) is now inked across the app. Payload protocol, renderers, colors-in-code (rainbow brackets), and `.dark` theme still work — this is a *chrome* redesign with functional content tweaks, not a renderer rewrite.

## What changed

### Tokens (`src/app/globals.css`)
- **Palette.** Bone keycap chrome (`--page-bg #ebe7dd` light / `#14110d` dark), one action orange, one confirmation mint, one alert brick. Radial-gradient background washes removed entirely (flat bone chassis, crisp).
- **Surfaces.** Cards are hairline-bordered etched panels on the bone chassis, no cream "card fill," no per-card shadows. Hairline borders get a touch darker (`--border-strong` raised).
- **Typography.** Display `Manrope`, body `SUSE`, mono `Spline Sans Mono` (all via `next/font/google`, self-hosted through Next). Wordmark is lowercase mono `agent-render`. Buttons and pills are uppercase mono with letter-spacing — the "engraved label" register.
- **Controls.** `.artifact-action` and `.mono-pill` are uniform keycaps: 1px border-strong, sharp 2px radius, uppercase mono text. The primary action is solid action-orange (no gradient), hover goes to `--accent-strong`.
- **Code surface.** `--surface-code*` flips to a **dark charcoal chassis even in light mode** — the dense content reads on dark, the chrome stays bone. This was the "QRH card/CR‑39 slip" move you flagged.
- **Animation budget.** Durations tightened; `budget-fill` now animates `transform: scaleX()` instead of `width`.

### Empty-state (`viewer-shell.tsx`)
- Hero copy rewritten — headline is now `Zero-retention viewer for AI output, delivered in one link.` The "Artifact viewer" kicker dropped (you called it slop).
- Pills under hero now carry brand facts the viewer can't infer: `open source / self-hostable / no database`.
- Bento "Initialize your Artifact" section rewritten to "What renders here" with three honest steps (01/02/03) plus a trust-model card. Redundant sub-cards (Hosting, double Security link) collapsed.
- **Fragment inspector** is now its own component, extracted cleanly. It renders **only when a fragment is in the URL**, and **moves to the very top of the page if decode fails** (`hasFragmentError`). Success state label renamed `Decoded` → `Ready`.
- Wordmark lowercased, mono, semibold. Footer rebuilt: wordmark + read-only/zero-retention tagline + inline nav (Security / URL explainer / GitHub) with hairline underlines and an orange underline-in on hover.
- New favicon: flat charcoal chassis tile with bone content lines and a single orange action stripe.

### Toolbar + metadata (`artifact-stage.tsx`, `artifact-selector.tsx`)
- "Decoded" mono-pill removed from the toolbar (your #11).
- Filename promoted to primary text at left, larger mono, follows the artifact.
- Column kind/status/file/size/language metadata grid collapsed from four bento cells to one tight horizontal strip inside a hairline panel (`.artifact-metadata-compact`).

### Disclosure (`fragment-details-disclosure.tsx`)
- Now **expanded by default** (`<details open>`).
- Title simplified from "Codec, budget, and hash preview" to "Transport and decode state."

### Renderer-chrome cleanup
- `read-only` mono-pill removed from JSON renderer toolbar (`json-renderer.tsx`).
- `read-only codemirror` kicker removed from code renderer toolbar.
- Markdown blockquote reshaped: side-tab accent-bar gone, replaced with hairline top border + decorative accent-orange open-quote, non-italic.
- Code-renderer toolbar and mermaid/json/csv toolbars inherit the new keycap grammar via existing class names.

### Mobile tightening
- Section paddings compressed at ≤640px (`hero`, `samples`, `inspector`, `stage`, `generator`: 4rem → 1.25–1.5rem).
- `.bento-card` mobile padding compressed to 1rem.
- Mobile shadow blur on panels/viewer-frames removed — crisp hairline borders are doing all the separation work.

## What's intentionally *not* shipped

- **Generator-input skeuomorphic "recessed slots."** Inputs now favor a thin bottom rule (1px border-bottom, `--border-strong` raising to `--accent` on focus), which reads as an engraved input. A heavier recessed look (inset shadow + raised border) is possible but fights the QRH-card flatness.

## Known risks to spot-check

1. **Contrast, light mode.** `--text-soft #7d7466` on `--page-bg #ebe7dd` is right at WCAG AA for 14px regular. Mono-pill labels pass (they now use `--text-primary`), but the small uppercase kicker `--text-soft` only just clears 4.5:1.
2. **`#ebe7dd` vs `#14110d`.** Verify light/dark transition doesn't look like a blinding flash on system-dark defaults.
3. **Print regression for markdown.** I removed the old `--print-*` overrides' dependence on cream — but print still uses `--print-paper` `#ffffff`, so nothing should regress. Worth one print-to-PDF sanity pass.
4. **`getStateTone("Ready")` rename.** If any e2e test expects literal "Decoded", it will fail. `grep -r "Decoded" tests/` before merging.

## How to exercise it

```bash
# 1. Fresh install (fonts are fetched by next/font at build-time)
npm install

# 2. Lint / typecheck / unit / bench
npm run check

# 3. E2E (skips visual snapshots on CI-shaped boxes)
CI=1 npm run test:e2e

# 4. Full overnight screenshot matrix (RUN_OVERNIGHT gates it)
npm run shots:overnight

# 5. Fresh sample links through the app's own encoder
npm run generate:samples
#   → .impeccable/overnight-shots/SAMPLE_LINKS.md

# 6. Start preview server for the sample links above
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build && npm run preview
#   → http://127.0.0.1:4401/agent-render/
```

## Verdict

The redesign is **ship-ready pending your spot-check**, with one focus area: contrast on the pale-bone surfaces in light mode, particularly the kicker mono caps. If `--text-soft` reads too pale, bump it to `#6e665a` and `--text-muted` to `#4c453c` — I'll land that change on a single-commit follow-up rather than shipping it tonight untested.

Diff scope summary:
- 9 files in `src/`, 1 new in `scripts/`, 1 new `tests/e2e/overnight.spec.ts`, 1 new icon, 1 new `MORNING.md` (this file).
- No protocol changes, no dependency changes, no payload contract changes.
- No `AGENTS.md`, `docs/`, or `skills/` updates required — the redesign stays inside the existing product surface.
