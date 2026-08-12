# Design System — agent-render

## Product

agent-render is a bench instrument for encoding artifacts into URL fragments and reading them back. The visual world is **Bench Instrument × Carbon Transfer**: airplane QRH grammar, Japanese information density, and disciplined skeuomorphism. Marketing layout is out of register.

## Theme

Hangar-bench QRH under fluorescent light — painted metal chassis, graphite legends, carbon-copy indigo impression. Light is hangar-day (primary). Dark is night-ops on the same chassis.

Color strategy: **Restrained**. Cobalt (seed hue 250°) is the operating accent. Oxide red is FAIL. Lamp green is READY. Amber is HOLD. Carbon indigo is a material, used only on the transfer slip.

## Colors

All UI color is OKLCH. Do not introduce hex except in SVG assets that cannot use OKLCH.

### Light (hangar day)

| Token | Value | Role |
| --- | --- | --- |
| `--page-bg` | `oklch(0.905 0.012 250)` | Painted instrument face |
| `--chassis` | `oklch(0.855 0.016 250)` | Header, footer, rails |
| `--surface` | `oklch(0.94 0.008 250)` | Raised procedure plate |
| `--surface-strong` | `oklch(0.965 0.006 250)` | Highest plate |
| `--well` | `oklch(0.88 0.014 250)` | Recessed input / slot |
| `--text-primary` | `oklch(0.22 0.03 250)` | Graphite ink |
| `--text-muted` | `oklch(0.38 0.025 250)` | Secondary; ≥4.5:1 on page |
| `--text-soft` | `oklch(0.42 0.02 250)` | Tertiary labels |
| `--accent` | `oklch(0.42 0.14 250)` | Cobalt — primary keys, selection |
| `--accent-strong` | `oklch(0.34 0.13 250)` | Pressed cobalt |
| `--success` | `oklch(0.44 0.11 155)` | READY lamp |
| `--warning` | `oklch(0.62 0.13 75)` | HOLD |
| `--danger` | `oklch(0.50 0.17 32)` | FAIL / oxide |
| `--carbon-paper` | `oklch(0.89 0.028 255)` | Transfer slip |
| `--carbon-ink` | `oklch(0.30 0.12 265)` | Carbon impression |

Primary fills use near-white text (`oklch(0.98 0.01 250)`).

### Dark (night ops)

Same roles, darker metal, lamps more visible. `--page-bg: oklch(0.20 0.018 250)`. `--accent: oklch(0.62 0.12 250)` still takes white text. Carbon slip stays a distinct tissue, not a generic elevated card.

## Typography

- **IBM Plex Sans** for all instrument chrome (400 / 500 / 600). Fixed rem scale, ratio ~1.125.
- **IBM Plex Mono** only for payload values: URLs, hashes, code, numeric budgets.
- **Fraunces** only inside markdown artifact headings (the document, not the chassis).
- Labels: 0.6875rem / 500, normal case, tracking ≤0.02em. No uppercase kickers.
- Viewer filename: 1.25rem / 600. Largest chrome type.
- Procedure title: 1.125rem / 600.

## Layout

The viewport is the chassis. Header, status rail, and footer span full width. The operating body is a dense max-width (~72rem) grid.

Homepage procedure:

1. Identify (kind keys, title, filename)
2. Load (content well)
3. Encode (codec keys + Generate)
4. Transfer (carbon slip, right column on desktop)

Samples are a reference table, not cards. Diagnostics sit in the chassis, not a detached inspector card.

Viewer hierarchy: filename → operating state + budget → controls → artifact → diagnostics.

Mobile keeps the same grammar: stack columns, do not enlarge type or padding into a marketing page.

## Elevation & materials

No ambient drop shadows, glass, or glow.

- **Raised key:** light top bevel, dark bottom bevel.
- **Pressed / selected key:** inset shadow, slightly darker face.
- **Well:** inset shadow, darker fill.
- **Status flag:** rectangular cutout with a lamp well, not a pill.
- **Carbon slip:** perforated head, indigo impression, the only expressive material.

Radius: 0 on chassis seams, 2px on physical keys.

## Components

- **Status flag:** STANDBY / READY / FAIL / HOLD. Text label plus lamp color.
- **Keys:** `.artifact-action` raised; `.is-primary` cobalt fill; `.is-active` pressed.
- **Fields:** recessed wells, 2px focus ring in cobalt.
- **Budget meter:** recessed trough, cobalt fill, no gradient.
- **Transfer slip:** produced record after generate; empty slot before.
- **Sample table:** compact rows, selected row pressed.
- **Footer:** manufacturer plate with zero-retention legend and nav.

## Motion

150–200ms, ease-out. Keys depress. Carbon slip seats into the slot. No page-load fade choreography. `prefers-reduced-motion: reduce` makes changes instant.

## Do / Don't

**Do:** start on the procedure; keep density on mobile; promote FAIL; put filename first; let materials explain state.

**Don't:** heroes, bento marketing, pills, glow, side-stripe accents, renderer-name chrome, "decoded" / "read-only" labels, oversized empty canvas.
