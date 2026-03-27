# UI De-Slop Design: agent-render

**Date:** 2026-03-27
**Direction:** Linear/Raycast clean — sharp, minimal, developer-tool aesthetic
**Scope:** Full visual overhaul — CSS tokens + component restructuring + layout changes

## Context

The agent-render UI has accumulated AI-generated visual patterns ("slop") that make it look like a template rather than a crafted tool. The warm color palette and component structure are solid, but the visual layer is overdecorated with glassmorphism, oversized radii, dramatic shadows, stacked gradients, and generic hero patterns. This design strips those patterns to achieve a Linear/Raycast-quality developer tool aesthetic while preserving the warm personality.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Aesthetic | Linear/Raycast clean | Developer tool, not marketing site |
| Colors | Keep warm, desaturate ~30% | Preserve personality, remove trend signal |
| Typography | Fraunces for wordmark only | Serif+sans combo is an AI slop tell |
| Approach | Full visual overhaul | CSS tokens + component structure + layout |

## Token Changes

### Border Radius
| Token | Current | Proposed |
|-------|---------|----------|
| `--radius-xl` | 28px | 10px |
| `--radius-lg` | 20px | 8px |
| `--radius-md` | 14px | 6px |
| `--radius-sm` | 999px (pill) | 4px |

### Shadows
| Token | Current | Proposed |
|-------|---------|----------|
| `--shadow-lg` | `0 26px 72px rgba(21,27,39,0.11)` | `0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)` |
| `--shadow-md` | `0 14px 34px rgba(21,27,39,0.075)` | `0 1px 2px rgba(0,0,0,0.06)` |

### Colors (Light)
| Token | Current | Proposed |
|-------|---------|----------|
| `--page-bg` | `#f2ecdf` | `#f7f5f2` |
| `--surface` | `rgba(255,249,241,0.84)` | `#ffffff` |
| `--surface-strong` | `rgba(255,252,247,0.96)` | `#fafaf9` |
| `--accent` | `#ba5937` | `#9c6b52` |
| `--accent-secondary` | `#0e6c77` | `#5c8a8e` |

### Colors (Dark)
| Token | Current | Proposed |
|-------|---------|----------|
| `--page-bg` | `#0a0f15` | `#111113` |
| `--surface` | `rgba(13,19,27,0.92)` | `#1a1a1c` |
| `--accent` | `#de7f58` | `#c09478` |
| `--accent-secondary` | `#72c4cf` | `#8ab5b9` |

### Motion
| Property | Current | Proposed |
|----------|---------|----------|
| `--duration-base` | 280ms | 150ms |
| Page-load animation | 720ms fade-up + staggered delays | Removed entirely |
| Hover effects | translateY(-2px) + shadow + color | Background color change only |

## Removals

1. **Glassmorphism**: All `backdrop-filter: blur(14px)` → solid backgrounds
2. **Shine overlays**: All `.panel::after` gradient gloss → deleted
3. **Stacked body gradients**: 3-layer radial gradients → solid `var(--page-bg)`
4. **Grid overlay**: Decorative `body::before` grid → deleted
5. **Hero icon pills**: ShieldCheck/Sparkles/FolderKanban badge row → deleted
6. **Gradient card backgrounds**: On hero-link-card, sample-link, creator-result → solid `var(--surface-elevated)`
7. **Gradient toolbar/code-frame headers** → solid `var(--surface-code-raised)`
8. **`fade-up` animation class** and `getAnimationStyle` helper → deleted
9. **`translateY` hover transforms** on all interactive elements → deleted
10. **Hover shadow additions** → deleted

## Typography

- **Wordmark ("agent-render")**: Fraunces 600 — keep
- **All headings (h1-h6)**: IBM Plex Sans 600 — change from Fraunces
- **Body text**: IBM Plex Sans 400 — keep
- **Code**: IBM Plex Mono — keep
- **Fraunces font import**: Reduce from weights [500, 600, 700] to [600] only

## Structural Changes

### Home Page
- Hero heading sizes reduced (~30% smaller, developer-tool scale)
- Hero subtitle reduced from `sm:text-lg` to `sm:text-base`
- Three icon-pill feature badges removed entirely
- Sample link cards: gradient backgrounds → solid borders
- Inspector/metrics section: keep, but simplified styling

### Viewer
- Toolbar: reduced min-height (2.7rem → 2.25rem) and padding
- Viewer header: tightened padding
- Content area: maximized by reducing chrome

## Files Modified

| File | Scope |
|------|-------|
| `src/app/globals.css` | ~60% of changes — tokens, panels, hovers, animations, gradients |
| `src/components/viewer-shell.tsx` | Hero restructuring, fade-up removal, font-display removal, icon cleanup |
| `src/components/home/link-creator.tsx` | fade-up removal, font-display removal |
| `src/components/theme-toggle.tsx` | Hover translateY removal |
| `src/app/layout.tsx` | Fraunces weight reduction |

## What's Preserved

- CodeMirror renderer styling (functional)
- Markdown article body typography (reading experience)
- Diff renderer layout (functional)
- CSV table styling (functional)
- JSON tree styling (functional)
- Syntax highlight colors (functional)
- Responsive breakpoints (correct)
- Print styles (correct)
- Accessibility: focus-visible outlines, semantic HTML, contrast ratios
- Dark mode support (all changes have corresponding dark overrides)

## Verification

1. `npm run dev` — visual inspection of home page, all 5 artifact types, dark mode
2. `npm run typecheck` — no TS errors from removed imports/props
3. `npm run test` — unit tests pass (no visual changes affect logic)
4. `npx playwright test tests/e2e/visual.spec.ts --update-snapshots` — regenerate all snapshots
5. `npx playwright test` — visual regression passes with new snapshots
6. Manual check: light mode, dark mode, mobile viewport (360px), tablet (768px)
7. Contrast check: verify `--accent` on `--page-bg` meets WCAG AA for large text
