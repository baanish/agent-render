# Agent-Render rebuild: target design vision

This design system snapshot is the CURRENT agent-render app (warm ivory, sunset orange, Fraunces/IBM Plex). The owner is rebuilding it toward a decided target world. When designing new screens, keep the components' behavior and data contracts, but push every visual decision toward this target, not toward the current look.

## The fused world: "Bench Instrument x Carbon Transfer"

Three influences. Give each ONE job; never average them into a blur:

1. **Airplane QRH card supplies the procedural grammar.** Numbered procedures, WARN/CAUTION/NOTE callouts, limits tables, revision and state markers. Sections read as numbered procedure and status blocks, not as marketing sections.
2. **Japanese high-density UI supplies the density.** Hairline 1px borders, a 9 to 12 column bench rig, dense stat rows instead of floating cards. Blocks dock against engraved dividers; nothing floats above a 16px gap. No dead space, no decorative empty grid rows.
3. **Skeuomorphism supplies the material.** Laminated cards, recessed input slots, molded keycaps, stamped and engraved labels, real hardware details. Depth is functional state, never generic drop shadows or glow.

"QRH first, Japanese density second, marketing page never."

## Palette

- Chrome: off-white bone keycap surfaces over a dark-engraved charcoal chassis. Reference tokens from the prior attempt: page bg `#ebe7dd` light / `#14110d` dark; dark-mode bone chrome lifted toward aged bone `#cfc6b4` (hi `#dcd5c5`, lo `#b8ae9c`), never muddy taupe.
- Content surfaces (code, diff, csv, json bodies) stay **dark charcoal in BOTH themes** (`#1c1915` family). Chrome stays bone; content reads on dark.
- Exactly one action orange, reserved for COMMIT actions and CAUTION states. One confirmation mint green. One alert brick red. Status is engraved uppercase mono caps plus one tiny real LED dot; never a glowing halo or a pill.
- No radial-gradient washes, no glass, no cream rounded cards, no shadow-glow.

## Type

- Target faces: Manrope (display), SUSE (body), Spline Sans Mono (mono). Aspirational picks were GT Eesti and Berkeley Mono. Space Grotesk is banned as overused.
- The current bundle ships Fraunces and IBM Plex Sans/Mono via `--font-display` / `--font-sans` / `--font-mono`; design against the variables, not the faces.
- Wordmark is lowercase mono `agent-render`. Buttons, pills, and labels are uppercase mono with letter-spacing: the engraved-label register. Mono is for data and labels only, never costume.

## Component grammar

- Buttons are keycaps: 1px strong border, sharp 2px radius, 2px machined bottom-edge depth (lit top edge, solid foot), press-down `:active` translate. Primary action is solid orange, no gradient.
- Inputs recess into the chassis: inset shadow or an engraved bottom rule that raises to orange on focus.
- Panels are hairline etched boxes on the bone chassis, no card fill, no per-card shadows.
- Carbon-transfer motif (dashed carbon strip, rotated red stamp, perforated tear line) belongs ONLY to the generated-link output; never tint artifact bodies.

## Layout and UX rules (owner-established, non-negotiable)

- No self-narrating chrome: never render labels like "Artifact viewer", "read-only", "Decoded", a bare kind kicker (`tsx`, `CSV`), or library names. Show the real filename or nothing. Filename is the primary toolbar text.
- The link creator is the most important surface: full width, first viewport, output below, structured as a five-step operations card with explicit READY and error states. Kill the marketing hero.
- Samples become a compact indexed sidebar, not showcase cards.
- The fragment inspector renders only when a fragment exists, and promotes to the very top of the page on decode error. Fragment details are expanded by default.
- A real footer: wordmark, zero-retention tagline, inline nav (Security / URL explainer / GitHub). Never a one-line stub.
- Mobile stays dense: compressed paddings, no wasted vertical space.

## Voice and claims

Terse, technical, honest. Headline register: "Share AI output as one link." Zero-retention is a host-design truth, not a privacy-anonymity promise; never overstate safety. Trust facts worth surfacing: open source, self-hostable, no database.

## Lessons from three failed rebuild attempts

- A token reskin is not a rebuild. The owner wants the world rebuilt from the ground up in this grammar.
- Do not build a second parallel token system; one token spine only.
- Do not brighten dark mode into flatness: keep depth, keep contrast (text must clear WCAG AA on the pale bone surfaces).
- Every visible surface counts: renderer toolbars, disclosure panels, footer, favicon, mobile paddings.
