# agent-render conventions

This library is the component set of a zero-retention artifact viewer app, not a generic UI kit. Read `guidelines/docs/design-vision.md` before designing: it is the owner's target direction (bench-instrument skeuomorphism, QRH procedural grammar, Japanese density) for a ground-up rebuild. The current components carry the old look; keep their behavior and data contracts, push the visuals toward the vision.

## Setup

No provider is required. All styling comes from the stylesheet closure (`styles.css` imports `_ds_bundle.css` and `fonts/fonts.css`). Theme: light is default; dark mode is the `dark` class on the root element (`<html class="dark">`). Never use `prefers-color-scheme` alone; the app toggles the class.

## Styling idiom: CSS custom properties

Style your own layout glue with the token variables, never hardcoded colors. The vocabulary (defined at `:root` and overridden in `.dark` inside `_ds_bundle.css`):

- Surfaces: `--page-bg`, `--surface`, `--surface-strong`, `--surface-muted`, `--surface-elevated`
- Borders: `--border`, `--border-strong` (hairline 1px borders are the separation grammar; avoid shadows)
- Text: `--text-primary`, `--text-muted`, `--text-soft`
- Accent and semantic: `--accent`, `--accent-strong`, `--accent-secondary`, `--success`, `--warning`, `--danger`
- Depth and shape: `--shadow-lg`, `--shadow-md`, `--radius-xl`, `--radius-lg` (radii are deliberately sharp, 2px)
- Fonts: `--font-display` (Fraunces), `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex Mono). Mono is for data and labels, uppercase with letter-spacing for the label register.

Component chrome classes ship in `_ds_bundle.css` (`.artifact-action`, `.mono-pill`, `.creator-input`, `.sample-link`, `.viewer-frame`, `.artifact-disclosure`); prefer composing the exported components over reaching for their internal classes.

## Data contracts

Renderers take an `artifact` object: `{ id, kind: "markdown"|"code"|"diff"|"csv"|"json", content, title?, filename?, language? }` (diff uses `patch` instead of `content`). Realistic ready-made payloads ship on `window.AgentRender.sampleEnvelopes` (6 envelopes; index 4 holds one artifact of every kind). Use them instead of inventing content.

## Gotchas

- Heavy renderers (CodeMirror, mermaid, diff) mount through dynamic imports; they appear a beat after first paint. Each renderer accepts `onReady`.
- DiffRenderer needs a real git `patch` string. The `oldContent`/`newContent` fallback currently renders an empty body (known app gap).
- arx-family codecs need `brotli-wasm`, which may not load in sandboxed frames. For `ViewerShell`/`SampleLinks` hashes, use deflate-coded `#d...` samples.
- `ViewerShell` is the whole page and reads `window.location.hash`; render it alone, not inside a layout.

## Idiomatic composition

```jsx
const { ArtifactStage, sampleEnvelopes } = window.AgentRender;
const env = sampleEnvelopes[4];
<div style={{ background: "var(--page-bg)", padding: "2rem" }}>
  <ArtifactStage
    activeArtifact={env.artifacts[0]}
    envelope={{ ...env, codec: "arx4" }}
    fragmentLength={1982}
    hash="#e..."
    onArtifactSelect={() => {}}
    onRendererReady={() => {}}
    rendererReadyKey={env.artifacts[0].id}
    statusTone={{ label: "Decoded", color: "var(--success)", message: "Fragment decoded successfully." }}
  />
</div>
```
