# design-sync notes for agent-render

## Build mechanics (learned on first sync, Aug 2026)

- The converter needs `cfg.entry` = `.design-sync/ds-entry.ts` (authored re-export list). Without it, PKG_DIR resolves to the nonexistent `node_modules/agent-render` and the build crashes. The entry also exports `sampleEnvelopes` (repo sample payloads) for previews and for the design agent.
- `.design-sync/process-shim.ts` must stay the first import in ds-entry.ts: components read `process.env.NEXT_PUBLIC_*` at module init and `next/dynamic` expects `process`; without the shim every preview throws `ReferenceError: process is not defined` and window.AgentRender ends up non-component.
- `.design-sync/harvest-css.mjs` (wired into buildCmd) turns the hashed Next CSS output into the stable cssEntry at `.design-sync/.cache/ds-css/main.css`: rewrites `/_next/static/media/` font urls to repo-relative, lifts the next/font `--font-*` variable classes to `:root`. Re-syncs must run `npm run build` first or the harvest fails loudly.
- Props auto-extraction can't work here (no shipped .d.ts tree; props types are file-local), so `cfg.dtsPropsFor` carries hand-written bodies for all 13 components. If a component's props change in src, update the config body too; nothing will fail automatically.
- Preview pattern for `<details>` components (FragmentDetailsDisclosure): open it post-mount via a ref effect (`querySelector("details").setAttribute("open","")`), exactly like a user click. Hover/drag states stay unauthored.
- tokens/ is empty by design: all custom properties live in the compiled globals.css inside `_ds_bundle.css`.

## Preview-authoring learnings (folded from the first-sync wave)

- App bug found while previewing (surface in any rebuild): DiffRenderer's `oldContent`/`newContent` fallback renders an empty diff body. `src/components/renderers/diff-renderer.tsx` (~line 501) builds `new DiffFile(..., [])` with an empty hunk list; `@git-diff-view/core` never diffs raw contents and `@git-diff-view/file` isn't installed. Previews only use the `patch` path.
- brotli-wasm cannot load under the static capture server (its `.wasm` fetch 404s), so arx-family encode/decode rejects with "Failed to fetch". Previews drive flows with the deflate codec / `#d...` sample hashes. Any preview using codec "auto" or an arx hash will hit this.
- Mermaid renders reliably headless, but font metrics clip the last glyph of labels: quote labels and append `&nbsp;`. Keep `flowchart TD` to <= 5 ranks for the ~536px cell.
- Native `button.click()` drives React delegated handlers in previews (LinkCreator generates a real link); sequence dependent clicks with ~50ms setTimeout.
- ViewerShell decoded state: set `window.location.hash` to a deflate sample hash in an effect, then mount behind a ready flag.
- `lucide-react` bare imports compile in preview-rebuild. Kind-icon map: `src/components/artifact-kind-icons.ts`; getHeading/getSupportingLabel live in `artifact-stage.tsx`.
- ArtifactSelector's 5-tab strip is ~1490px intrinsic and clips at its own scroll edge (no escape); previews scroll to the active tab post-mount instead of a viewport override (an explicit viewport re-keys and clears grades).
- ViewerShell has `overrides.ViewerShell = {cardMode: single, primaryStory: EmptyHomepage, viewport: 1280x900}` for a fuller single-card capture.

## Known render warns

- (none recorded yet; add any warn triaged as legitimate here so re-syncs don't chase it)

## Re-sync risks (watch-list for the next run)

- The claude.ai/design agent (Aug 6 redesign run) applied lint fixes directly to the uploaded `_ds_bundle.css`: folded the next-font `__variable_*` classes into `:root`, added `@kind` annotations to unclassifiable tokens, inlined utility-scoped `--tw-*` state vars, and re-scoped the diff theme vars to plain `[data-theme=...]` scopes. A re-sync will overwrite these with the locally-built CSS and re-introduce the adherence flags; ideally teach harvest-css.mjs the same transforms (or accept the flags as known).

- `dtsPropsFor` bodies are hand-copied from file-local src types; a props change in src updates nothing automatically. When any component's props change, update the config body in the same PR.
- `.design-sync/ds-entry.ts` is the export list; adding or removing a component in src requires editing it (and `componentSrcMap`, `dtsPropsFor`).
- `harvest-css.mjs` assumes the Next build emits exactly one CSS file and `__variable_*` font classes; a Next major upgrade can change both. It throws loudly rather than shipping stale CSS, but the fix will be manual.
- Previews index into `sampleEnvelopes` by position (0, 2, 3, 4, 5); reordering `src/lib/payload/examples.ts` silently changes preview content without failing anything.
- The ViewerShell/LinkCreator/SampleLinks previews run real decode/generation flows against deflate sample hashes from `sample-link-data.ts`; edits there shift what the cards show.
- Fonts are fetched by next/font at `npm run build` time (network dependency of the buildCmd).
- Render check ran against the playwright/chromium-1228 cache matching the repo pin; a repo playwright bump needs a matching browser install.
- Verified: everything except hover/drag states and the DiffRenderer `oldContent`/`newContent` path (broken in the app, see above). Grades carry via the uploaded `_ds_sync.json`.



- Purpose of this sync (Aug 2026): the user is rebuilding agent-render's UI in claude.ai/design. Three prior Kimi K3 sessions failed at it. The decided design direction (from the cursor session, `~/Downloads/kimi-failed-cursor.md`) is "fused bench-instrument world": skeuomorphism + Japanese high density + airplane QRH card. Target project: agent-render-skeumorphism.
- This repo is an app, not a library: no dist entry, converter runs in synth-entry mode from `src/` with tsconfig `@/*` path aliases.
- Fonts come from `next/font/google` (Fraunces display, IBM Plex Sans body, IBM Plex Mono). There are no @font-face files in source; harvest compiled CSS + woff2 from `out/_next/static/` after `npm run build`. Font families are exposed as `--font-display`/`--font-sans`/`--font-mono` variables set by Next-generated classes on `<html>`, so the shipped styles need a hand-authored bridge that defines those variables at `:root`.
- `src/app/globals.css` starts with `@import "tailwindcss"` (Tailwind 4 via PostCSS); components mostly use bespoke classes defined in globals.css, but the compiled CSS from the Next build is the honest cssEntry source.
- Component set (13): ViewerShell, ThemeToggle, ArtifactSelector, ArtifactStage, FragmentDetailsDisclosure, MarkdownRenderer, CodeRenderer, DiffRenderer, CsvRenderer, JsonRenderer, MermaidBlock, LinkCreator, SampleLinks. `use-theme-controller` is a hook, `hash-preview.ts` a utility; neither is a component.
- Heavy renderers (CodeMirror, mermaid, @git-diff-view/react, papaparse) are dynamically imported in the app; previews must allow them time to mount (`onReady` callbacks exist on renderer props).
- Vision guideline docs are user-approved to ship in `guidelines/` (skeuomorphism + Japanese density + QRH direction, 16 UI criticisms as hard rules).
- Agent feedback the user endorsed (Aug 6, from "brodie" and "Orion"): do NOT average the three aesthetics; assign each one a job. QRH supplies procedural grammar (numbered steps, WARN/CAUTION/NOTE callouts, limits, revision/state markers). Japanese UI supplies density. Skeuomorphism supplies material (laminated cards, recessed fields, molded keys, stamped labels, dividers, hardware; never generic shadows). Kill the hero; the link generator is the first viewport; whole viewport a fixed instrument grid; sections become numbered procedure/status blocks; orange reserved for CAUTION/action states; samples become a compact indexed sidebar; CREATE A LINK becomes a five-step operations card with explicit READY/error states. "QRH first, Japanese density second, marketing page never."
