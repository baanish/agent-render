# Design System Specification

## 1. Overview & Creative North Star
**Creative North Star: "The Sentient Archive"**

This design system is a deliberate collision between the cold, hyper-logical efficiency of a terminal and the warm, narrative elegance of high-end editorial print. It rejects the "app-like" genericism of modern SaaS, opting instead for an interface that feels like a living document—one part research paper, one part mainframe terminal.

We achieve this through **Intentional Asymmetry**. By breaking the rigid, centered layout of standard dashboards and utilizing high-contrast typography scales, we create a visual rhythm that guides the eye through storytelling rather than just data consumption. The interface does not just "display" information; it "curates" it.

---

## 2. Colors: The Sunset Archive
The palette is rooted in a deep, atmospheric transition from midnight to dawn.

*   **Primary Palette:** 
    *   `primary`: #FF8757 (The Glow) – Use for critical data points and primary actions.
    *   `surface`: #0B0C1F (Midnight Indigo) – The infinite canvas.
    *   `tertiary`: #F1E7FF (Lavender Metadata) – For supporting technical details.
*   **The "No-Line" Rule:** 
    Explicitly prohibit 1px solid borders for sectioning. Structural boundaries must be defined solely through background color shifts. Use `surface-container-low` to distinguish a sidebar from the `surface` main area.
*   **Surface Hierarchy & Nesting:** 
    Treat the UI as physical layers. An inner module should sit on a `surface-container-highest` background if the parent is `surface-container`, creating a "stacking" effect that suggests depth without needing drop shadows.
*   **The "Glass & Gradient" Rule:** 
    For floating overlays (modals or dropdowns), use `surface-variant` with a 60% opacity and a 20px backdrop-blur. Apply a subtle linear gradient from `primary` to `primary-container` on high-value CTAs to give them a "holographic" tactile quality.

---

## 3. Typography: The Hybrid Voice
We use three distinct typefaces to separate the "Human" narrative from the "Machine" logic.

*   **Humanity (Newsreader - Serif):** Used for `display` and `headline` tiers. It should feel authoritative, like a New York Times editorial. It is the voice of the curator.
*   **Structure (Space Grotesk - Sans):** Used for `title` and `label` tiers. This provides the structural skeleton. It is utilitarian but modern.
*   **Logic (IBM Plex Mono - Monospaced):** Used for raw data, timestamps, and "thinking" states. This is the heartbeat of the protocol.

**The Hierarchy Scale:**
*   `display-lg`: Newsreader, 3.5rem (The Headline)
*   `title-md`: Space Grotesk, 1.125rem (The Navigation/Header)
*   `label-sm`: IBM Plex Mono, 0.6875rem (The Technical Metadata)

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** and atmospheric physics rather than traditional shadows.

*   **The Layering Principle:** Stack `surface-container-lowest` cards on a `surface-container-low` section. The contrast creates a natural lift.
*   **Ambient Shadows:** If a floating effect is mandatory, use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(11, 12, 31, 0.2)`. The shadow color must be a tint of the background, never a neutral gray.
*   **The "Ghost Border" Fallback:** If a container requires a border for accessibility, use `outline-variant` at 15% opacity. High-contrast, 100% opaque borders are forbidden.
*   **Glassmorphism:** Use `surface-bright` with 40% transparency and a heavy backdrop-blur (12px+) for high-density desktop dashboards to maintain a sense of "layered transparency."

---

## 5. Components

### Primitive Components
*   **Buttons:**
    *   *Primary:* Solid `primary` (#FF8757) with `on-primary` (#4F1700) text. Sharp 0px corners.
    *   *Tertiary:* `outline` Ghost Border with `IBM Plex Mono` labels.
*   **Input Fields:**
    *   No bottom border. Use a subtle `surface-container-high` background. Labels are always `label-sm` in `Space Grotesk`.
*   **Cards & Lists:**
    *   Never use divider lines. Use `0.9rem` (spacing scale 4) gaps or tonal shifts (`surface-container-low` to `surface-container-highest`) to separate list items.
*   **The Thinking Indicator (Signature Motif):**
    *   A central animation based on the math formula: `x = 7cos(t) - d·cos(7t), y = 7sin(t) - d·sin(7t)`.
    *   Rendered as a fine-line stroke in `primary` (#FF8757). This replaces standard spinners.

### Specialized Components
*   **The Data Ribbon:** A high-density horizontal strip using `IBM Plex Mono` to display real-time protocol metrics at the top or bottom of the screen.
*   **Editorial Hero:** An asymmetrical layout pairing a `display-lg` serif headline with a `surface-container-highest` data visualization.

---

## 6. Do’s and Don’ts

### Do
*   **DO** use the `0px` roundedness scale for everything. The system is sharp, precise, and architectural.
*   **DO** use `Newsreader` in italics for emphasis within body text to lean into the editorial aesthetic.
*   **DO** allow elements to overlap. A serif headline can partially overlay a glassmorphic data card.
*   **DO** utilize visible grid lines (`outline-variant` at 10% opacity) on desktop views to emphasize the "terminal" structure.

### Don't
*   **DON’T** use rounded corners (`border-radius`). Ever.
*   **DON’T** use standard blue for links. Use `primary` orange or `tertiary` lavender.
*   **DON’T** use dividers or "HR" tags. Space and tonal shifts are your only tools for separation.
*   **DON’T** center-align long-form text. Editorial content should be left-aligned with generous, asymmetrical right margins.