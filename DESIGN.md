---
name: agent-render
description: A procedural artifact viewer shaped as Bench Instrument x Carbon Transfer.
colors:
  page-canvas: "#ebe7dd"
  page-canvas-dark: "#14110d"
  primary-ink: "#211d18"
  muted-ink: "#5f584d"
  bone-key: "#e3ddd0"
  bone-key-dark: "#cfc6b4"
  bone-key-lift: "#f2ede3"
  bone-key-lift-dark: "#dcd5c5"
  bone-key-mid: "#d2cab9"
  bone-key-mid-dark: "#b8ae9c"
  bone-key-edge: "#958a79"
  bone-key-edge-dark: "#756b5b"
  chassis: "#211d18"
  chassis-dark: "#1c1915"
  chassis-deep: "#14110d"
  chassis-deep-dark: "#0f0d0a"
  chassis-raised: "#2b2620"
  chassis-ink: "#e3dccd"
  chassis-muted: "#b8ae9c"
  structural-line: "#51493e"
  action-orange: "#cf6828"
  action-orange-edge: "#8f3c12"
  confirmation-mint: "#559174"
  confirmation-mint-dark: "#69a889"
  confirmation-edge: "#2d5d43"
  alert-brick: "#c96b57"
  alert-edge: "#713126"
  amber-readout: "#d59a43"
  paper: "#f0eadf"
  paper-dark: "#1a1713"
  paper-ink: "#28221b"
  paper-ink-dark: "#ece4d6"
  paper-body: "#4d453a"
  paper-body-dark: "#c9c0b0"
  carbon-paper: "#d9d0bd"
  carbon-paper-dark: "#d2c8b3"
  carbon-ink: "#41392f"
  carbon-line: "#776d5e"
  renderer: "#1c1915"
  renderer-raised: "#27221c"
  renderer-text: "#e1d9ca"
  control-face: "#26221d"
  control-face-lift: "#2e2923"
  control-face-pressed: "#1a1713"
  control-text: "#ece4d6"
  control-accent: "#b74d18"
  control-accent-dark: "#cf7a1c"
  control-accent-ink: "#fff7ee"
  control-accent-ink-dark: "#1a0e08"
  control-success: "#3a7d5c"
  control-success-dark: "#50a877"
  control-success-ink: "#edf8f2"
  control-success-ink-dark: "#102218"
  key-ink: "#241f19"
  confirmation-ink: "#111a15"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(24px, 3.2vw, 40px)"
    fontWeight: 760
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(21px, 2.2vw, 29px)"
    fontWeight: 760
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "18px"
    fontWeight: 760
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  body:
    fontFamily: "SUSE, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "Spline Sans Mono, monospace"
    fontSize: "9px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0.085em"
rounded:
  square: "0"
  instrument: "2px"
spacing:
  micro: "4px"
  key-gap: "7px"
  compact: "8px"
  field: "10px"
  shell: "12px"
components:
  button-primary:
    backgroundColor: "{colors.control-accent}"
    textColor: "{colors.control-accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "7px 10px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.control-text}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "7px 10px"
    height: "38px"
  button-confirmed:
    backgroundColor: "{colors.control-success}"
    textColor: "{colors.control-success-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.instrument}"
    padding: "7px 10px"
    height: "38px"
  input-recessed:
    backgroundColor: "{colors.chassis-deep}"
    textColor: "{colors.chassis-ink}"
    rounded: "{rounded.instrument}"
    padding: "8px 10px"
    height: "40px"
  panel-chassis:
    backgroundColor: "{colors.chassis}"
    textColor: "{colors.chassis-ink}"
    rounded: "{rounded.instrument}"
    padding: "12px"
  artifact-switcher:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.control-text}"
    rounded: "{rounded.instrument}"
    padding: "7px 9px"
    height: "50px"
  carbon-output:
    backgroundColor: "{colors.carbon-paper}"
    textColor: "{colors.carbon-ink}"
    rounded: "{rounded.square}"
    padding: "20px 12px 22px"
---

# Design System: agent-render

## Overview

**Creative North Star: "Bench Instrument x Carbon Transfer"**

agent-render is an operating surface, not a promotional page. Airplane QRH supplies the procedural grammar first: numbered operations, limits, cautions, and explicit commit actions. Japanese high-density interface practice comes second, keeping metadata compact, aligned, and continuously visible. Functional skeuomorphic material comes third through charcoal keycaps, a darker chassis, recessed wells, engraved hairlines, and a carbon-transfer result that appears only after generation.

The hierarchy is intentionally “QRH first, Japanese density second, marketing page never.” Every surface should help an operator format, identify, load, compress, generate, inspect, or export an artifact. Decoration is permitted only when it makes state, structure, or physical interaction easier to understand.

**The Procedure-First Rule.** Put the current operation, its state, and its constraints before explanation or promotion.

**Key Characteristics:**

- Compact procedural sequencing with visible numbering
- Raised instrument controls (charcoal keys in dark mode, bone keys in light) with burnt-orange selected edges
- Dense monospace metadata paired with direct, readable headings
- Carbon paper reserved for successfully generated output
- Artifact-first viewing with limits and fragment details kept visible

## Colors

The palette is warm, low-gloss, and material-led: dark mode runs charcoal keys on a carbon-brown chassis, light mode runs bone keys on a paper chassis, and three scarce semantic signals stay constant across both.

### Primary

- **Commit Orange:** The only action accent; use it for irreversible or outcome-producing controls and caution boundaries.

### Secondary

- **Confirmation Mint:** Use only for ready, verified, copied, and successful transfer states. The dark theme uses its brighter implemented counterpart.

### Tertiary

- **Alert Brick:** Use only for faults, warnings, invalid payloads, and renderer errors.
- **Readout Amber:** Reserve for encoded hashes and technical readouts inside recessed dark wells.

### Neutral

- **Aged Bone:** Reserved for paper-adjacent surfaces and the identity mark rather than interactive controls.
- **Instrument Controls:** Raised keys keep the same physical grammar in both themes: a lifted face, a hard lower foot, and a darker pressed well. Dark mode uses a #26221d charcoal face with ivory labels; light mode uses a bone face with ink labels. A one-pixel burnt-orange edge marks persistent selection without turning the whole key into an accent.
- **Instrument Chassis:** The structural shell for procedures, toolbars, panels, and diagnostics. Charcoal in dark mode, warm bone in light mode.
- **Instrument Paper:** Rendered markdown uses warm paper in light mode and a charcoal document field with ivory text in dark mode.
- **Carbon Transfer Stock:** A distinct generated-output material with its own ink and perforation lines.
- **Renderer Surface:** Code, diff, CSV, JSON, raw source, and technical preview surfaces follow the shell theme: paper stock with ink text in light mode, charcoal with ivory text in dark mode.

**The Three-Signal Rule.** Orange commits, mint confirms, and brick alerts; never interchange these roles or add a competing accent.

**The Theme-Follow Rule.** Every surface follows the shell theme, including renderer bodies; light mode is a full light instrument, not a dark chassis on a light page.

## Typography

**Display Font:** Manrope (sans-serif fallback)

**Body Font:** SUSE (sans-serif fallback)

**Label/Mono Font:** Spline Sans Mono (monospace fallback)

**Character:** Manrope makes headings compact and unmistakable without becoming editorial. SUSE carries readable operational prose, while Spline Sans Mono turns labels, metrics, filenames, and readouts into instrument notation.

### Hierarchy

- **Display** (760, responsive 24–40px, 1.02): Artifact titles and the strongest page-level headings.
- **Headline** (760, responsive 21–29px, 1.05): Procedure and workbench headings.
- **Title** (760, 18px, 1.05): Panel, limits, and inspector headings.
- **Body** (400, 15px, 1.7): Rendered prose; markdown reading width is capped at 76ch.
- **Label** (650, 9px, 0.085em tracking): Uppercase procedure labels, field names, and metrics.

**The Instrument Type Rule.** Use Manrope for identity and hierarchy, SUSE for explanations and content, and Spline Sans Mono for anything measured, indexed, encoded, or stateful.

## Layout

The shell is a centered single-column instrument bay capped at 1500px, with a compact 54px sticky header and 12px outer rhythm. Structural groups use dense 1px dividers and small internal gaps rather than isolated floating cards. The homepage procedure remains the dominant full-width block; samples and operating limits form a 12-column secondary region from 880px upward, with the samples index occupying three columns and staying visible below the header.

Responsive behavior preserves order and density. At 760px, toolbars wrap, two-column metric and result grids collapse, and patch navigation stacks above the file surface. At 520px, nonessential header navigation disappears, identification fields become single-column, commit controls span the available width, and result actions stack. At 360px, the narrowest toggles and fragment metrics become single-column. Artifact selectors and patch files scroll horizontally rather than truncating their operating choices.

**The Continuous-Chassis Rule.** Prefer divided grids and shared rails over detached card collections; adjacent information should read as one machine assembly.

## Elevation & Depth

Depth is structural rather than atmospheric. Chassis panels use hairline borders and a faint inner top shine. Charcoal controls sit two pixels above a near-black foot and physically depress by two pixels when active. Inputs, hash wells, and renderer diagnostics use inset shadows to read as recessed. There are no floating ambient card shadows, blurred glows, or decorative elevation layers.

### Shadow Vocabulary

- **Raised key:** A fine top shine plus a hard 2px lower edge; use on clickable charcoal controls.
- **Pressed key:** A compact inset shadow paired with a 2px downward translation.
- **Recessed well:** A 2–5px dark inset shadow for editable fields, hashes, and raw technical readouts.
- **Chassis hairline:** A nearly transparent 1px inset highlight for large dark instrument panels.

**The Mechanical-Depth Rule.** Every shadow must explain whether a control is raised, pressed, recessed, or mounted; if it explains none of those, remove it.

## Shapes

The form language is nearly square. Controls, panels, fields, and frames share a 2px corner radius. Carbon-transfer output and its readout fields use square corners. One-pixel borders and internal rules provide most silhouettes. Circular geometry is limited to file-status dots.

**The Two-Pixel Rule.** Use 2px corners for the instrument system, 0 for carbon paper, and circles only for indicator lights; do not introduce soft card radii.

## Components

Components should feel manufactured, compact, and legible under pressure. Their states are expressed through material movement and semantic color, not ornamental animation.

### Buttons

- **Shape:** Shallow charcoal instrument key with 2px corners and a hard near-black lower edge.
- **Primary:** Solid burnt orange belongs to the Generate action, with compact padding and a 38px minimum height.
- **Hover / Focus:** Hover lifts the charcoal value slightly; keyboard focus uses a 2px orange ring with a 2px offset; active and selected controls move down 2px into an inset state.
- **Secondary:** Charcoal face with ivory ink. Persistent selection keeps the dark pressed face and adds one burnt-orange inset edge.
- **Confirmed:** Deep mint replaces the key face only after a successful action.

### Cards / Containers

- **Corner Style:** Instrument corners (2px), never soft rounded cards.
- **Background:** Chassis for procedural groups; theme-aware document fields only for readable markdown; carbon stock only for generated links.
- **Shadow Strategy:** Hairline mounting shine for chassis and physical raised/recessed shadows for controls and wells.
- **Border:** One-pixel structural rules divide headings, rails, steps, cells, and bodies.
- **Internal Padding:** Dense 8–12px spacing, increasing only for readable artifact content.

### Inputs / Fields

- **Style:** Dark recessed field, 2px corners, 1px structural border, 40px minimum height; multiline source input uses the monospace face.
- **Focus:** Strengthen the edge and add a single-pixel outer ring while keeping the recessed inset.
- **Error / Disabled:** Brick identifies faults; disabled controls reduce opacity but retain their physical shape.

### Navigation

The sticky shell header uses charcoal key controls on the chassis. Artifact navigation uses horizontally scrollable raised switchers with a clearly depressed active item and one burnt-orange inset edge. On narrow screens, hide only secondary global navigation and preserve task controls.

### Procedure Steps

Each operation pairs a fixed indexed rail with a flexible work area. The numbered rail is darker than the chassis, uses monospace labels, and stays visually connected through shared borders.

### Status and Callouts

Errors use direct headings and recovery copy instead of simulated telemetry. Safety callouts use explicit NOTE, CAUTION, or WARN labels and a matching border; semantic color never replaces the text label.

### Carbon Transfer Output

Generated links emerge as square carbon stock with a perforated top strip, dashed tear line, and slightly rotated approval stamp. The 260ms feed animation is unique to successful generation and collapses to effectively static under reduced-motion preferences.

**The State-Must-Move Rule.** Selected and pressed keys must visibly depress; successful output may feed into view, but routine panels never float or pulse.

## Do's and Don'ts

### Do:

- **Do** lead task surfaces with a numbered procedure, visible state, and operating constraints.
- **Do** keep metadata compact, aligned, and readable in Spline Sans Mono.
- **Do** use 1px dividers, 2px corners, and structural depth to assemble dense information.
- **Do** preserve dark renderer bodies across light and dark shell themes.
- **Do** keep touch targets usable while allowing labels and metadata to stay visually dense.

### Don't:

- **Don't** build a marketing hero, feature-card parade, or promotional narrative ahead of the operation.
- **Don't** add decorative pills, soft rounded cards, blurred glows, glass effects, or ambient floating shadows.
- **Don't** use orange, mint, brick, or amber as interchangeable decoration.
- **Don't** use carbon-transfer paper before a successful generated output exists.
- **Don't** hide limits, faults, or transport diagnostics to make a surface feel cleaner.
