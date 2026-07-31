# Design kit for `html` artifacts

The `html` artifact kind renders agent-authored markup with a design system that ships in the
viewer. Agents supply structure and content; the viewer supplies the design, once, so models never
invent styling. Payload CSS is neither needed nor allowed: fragment payloads render sanitized, and
inline styles and `<style>` blocks are stripped.

## Trust model

- Fragment links (public site and self-hosted alike) are mintable by anyone, so their HTML is
  sanitized: no scripts, no event handlers, no `javascript:` URLs, no form controls, no inline
  styles, no foreign content (svg/math), no `id`/`name` attributes. The allowlist lives in
  `src/lib/html/sanitize-kit-html.ts`.
- Server-injected payloads on a self-hosted instance (UUID links) render verbatim, scripts
  included, but inside a sandboxed iframe (`allow-scripts` without `allow-same-origin`): the HTML
  runs in an opaque origin, so scripts and forms work while the document cannot reach the parent
  DOM, the auth cookie, or the artifact API. Because the frame is origin-isolated it does not inherit
  the kit stylesheet: trusted HTML should be a self-contained document with its own styles. The
  `ar-*` kit vocabulary is for the sanitized inline (fragment) path.
- Kit interactivity is viewer-owned JS keyed off `ar-*` classes, so sanitized artifacts still get
  tabs and disclosure behavior without shipping a single agent-authored script.

## Components

| Class | Use |
| --- | --- |
| `ar-card` | Bordered surface with padding and shadow |
| `ar-grid` | Responsive auto-fit grid (min column 14rem) |
| `ar-stack` | Vertical flex stack with gaps |
| `ar-row` | Horizontal wrap row with gaps |
| `ar-stat` + `ar-stat-label` + `ar-stat-value` | KPI tile |
| `ar-badge` (+ `-success`, `-warning`, `-danger`, `-accent`) | Status pill |
| `ar-callout` (+ `-success`, `-warning`, `-danger`, `-info`) | Highlighted note |
| `ar-tabs` > `ar-tab` with `data-ar-tab="Label"` | Tabbed panels; the viewer builds the tab bar |
| `<details>` / `<summary>` | Native disclosure, styled by the kit |
| `ar-choices` | Decision list; each `<li data-ar-id="a">` renders a badge from the attribute, a nested `<small>` is the detail line |

Plain tables, headings, lists, blockquotes, code blocks, images (https or data:image), and links
are styled automatically inside `.kit-html`; no classes needed.

Decision lists are just a kit component, not a separate artifact kind: there is no channel back from
the viewer, so options are presentation. Put the options inline with whatever context the reader needs
and tell them how to answer, since the reply happens in chat.

```html
<p>Five follow-ups. Reply with the ids you want, e.g. <code>do a, c, e</code>.</p>
<ol class="ar-choices">
  <li data-ar-id="a">Fix the TTL off-by-one<small>Sweeper deletes an hour early.</small></li>
  <li data-ar-id="b">Document the auth header</li>
</ol>
```

Example:

```html
<div class="ar-grid">
  <div class="ar-stat">
    <p class="ar-stat-label">Tests</p>
    <p class="ar-stat-value">212 / 212</p>
  </div>
</div>
<div class="ar-tabs">
  <div class="ar-tab" data-ar-tab="Summary"><p>All green.</p></div>
  <div class="ar-tab" data-ar-tab="Details"><p>One retry in e2e.</p></div>
</div>
```

## Composable utilities

Agent markup is not scanned by Tailwind at build time, so only a pinned utility subset exists in
the shipped stylesheet. Anything outside this list silently does nothing; compose custom layouts
from these plus the components above. The pin lives in `src/app/globals.css` (`@source inline`)
and must change together with this table and the skill.

- Display: `block`, `inline-block`, `flex`, `inline-flex`, `grid`, `hidden`
- Flex/grid: `flex-row`, `flex-col`, `flex-wrap`, `items-start|center|end`,
  `justify-start|center|between|end`, `grid-cols-1..4`, `gap-0|1|2|3|4|6|8`
- Spacing: `p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr` at `0|1|2|3|4|6|8`
- Text: `text-xs|sm|base|lg|xl|2xl|3xl`, `font-normal|medium|semibold|bold`,
  `text-left|center|right`, `italic`, `underline`, `uppercase`, `tracking-wide`,
  `leading-tight|relaxed`
- Boxes: `w-full`, `max-w-full`, `min-w-0`, `overflow-x-auto`, `overflow-hidden`,
  `whitespace-nowrap`, `break-words`, `rounded`, `border`, `border-t`, `border-b`, `shrink-0`,
  `grow`

## Authoring rules for agents

- Write semantic HTML with kit classes; never write `<style>`, `style=`, or scripts (they are
  stripped on fragment links and are a scope error on trusted ones: use the kit).
- Prefer components over utility soup; reach for utilities only where no component fits.
- Keep it dense and scannable: stats up top, detail behind tabs or `<details>`.
- Links must use absolute `https:` (or `mailto:`) URLs; `http:` and bare-fragment (`#...`) hrefs
  are stripped. Images must be `https:` or `data:image/*;base64`.
