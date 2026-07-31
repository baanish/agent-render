/**
 * Sanitizer for kit `html` artifacts rendered inline on the viewer origin.
 *
 * Threat model: fragment URLs are mintable by anyone and agents relay untrusted content, so
 * artifact HTML is attacker-controlled even when the sending agent is trusted. Everything that can
 * execute or phish is removed: scripts, event handlers, javascript: URLs, form controls, foreign
 * content (svg/math), and DOM-clobbering vectors (id/name). Layout, text, tables, links, images,
 * and the kit's classes pass through; kit interactivity is viewer-owned JS keyed off ar-* classes.
 * Server-injected payloads (self-hosted trusted mode) bypass this sanitizer by design — that is the
 * operator's documented risk, not this module's concern.
 */

// Removed together with their children: executable, embedding, styling, and form vectors.
const droppedTags = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "link",
  "meta",
  "base",
  "title",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "option",
  "optgroup",
  "label",
  "fieldset",
  "legend",
  "datalist",
  "output",
  "dialog",
  "template",
  "slot",
  "svg",
  "math",
  "video",
  "audio",
  "source",
  "track",
  "canvas",
  "map",
  "area",
  "noscript",
]);

const allowedTags = new Set([
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "mark",
  "blockquote",
  "q",
  "cite",
  "pre",
  "code",
  "kbd",
  "samp",
  "var",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "a",
  "img",
  "figure",
  "figcaption",
  "details",
  "summary",
  "time",
  "abbr",
  "sup",
  "sub",
  "del",
  "ins",
]);

// `id` and `name` are deliberately absent: user markup rendered on the app's own DOM could
// otherwise clobber window properties or anchor targets the shell relies on.
const globalAllowedAttributes = new Set(["class", "title", "dir", "lang", "role", "hidden"]);

const perTagAllowedAttributes: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  ol: new Set(["start", "reversed"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  td: new Set(["colspan", "rowspan"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  details: new Set(["open"]),
  time: new Set(["datetime"]),
};

function isSafeHref(value: string): boolean {
  // https/mailto only. Bare-fragment (`#...`) hrefs are rejected: rendered inline on the viewer
  // origin they would rewrite the shell's own location.hash and swap the active artifact for
  // attacker-crafted content inside the product chrome. http is rejected so active links can't
  // downgrade to cleartext.
  return /^(https:|mailto:)/i.test(value.trim());
}

function isSafeImageSrc(value: string): boolean {
  const trimmed = value.trim();
  return /^https:\/\//i.test(trimmed) || /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(trimmed);
}

function isAttributeAllowed(tag: string, name: string): boolean {
  if (name.startsWith("aria-") || name.startsWith("data-ar-")) {
    return true;
  }
  if (globalAllowedAttributes.has(name)) {
    return true;
  }
  return perTagAllowedAttributes[tag]?.has(name) ?? false;
}

function sanitizeElementAttributes(element: Element, tag: string): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();

    if (name.startsWith("on") || !isAttributeAllowed(tag, name)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "a" && name === "href" && !isSafeHref(attribute.value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "img" && name === "src" && !isSafeImageSrc(attribute.value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (tag === "a" && name === "target" && attribute.value !== "_blank") {
      element.removeAttribute(attribute.name);
    }
  }

  if (tag === "a" && element.getAttribute("target") === "_blank") {
    element.setAttribute("rel", "noopener noreferrer");
  }

  if (tag === "img" && !element.hasAttribute("loading")) {
    element.setAttribute("loading", "lazy");
  }
}

function sanitizeChildren(parent: Element): void {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (droppedTags.has(tag)) {
      element.remove();
      continue;
    }

    if (!allowedTags.has(tag)) {
      // Default-deny: unknown elements are removed with their subtree rather than unwrapped.
      // Promoting the children of an unknown wrapper is the classic place mXSS reappears as the
      // HTML parser evolves; the allowlist already covers every kit and prose tag.
      element.remove();
      continue;
    }

    sanitizeElementAttributes(element, tag);
    sanitizeChildren(element);
  }
}

function parseAndSanitize(html: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  sanitizeChildren(parsed.body);
  return parsed.body;
}

/**
 * Returns a safe HTML string for the sanitized subset, or an empty string when no DOM parser is
 * available. Prefer {@link sanitizeKitHtmlInto} for rendering: this string form round-trips through
 * a second parse when assigned to innerHTML, which is the mutation-XSS surface adoption avoids.
 */
export function sanitizeKitHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return "";
  }
  return parseAndSanitize(html).innerHTML;
}

/**
 * Sanitizes `html` and adopts the resulting nodes directly into `container`, replacing its current
 * children. This avoids serializing back to a string and letting the browser re-parse it (the
 * mutation-XSS vector): the exact nodes the sanitizer inspected are the nodes that render.
 */
export function sanitizeKitHtmlInto(container: HTMLElement, html: string): void {
  if (typeof DOMParser === "undefined") {
    container.replaceChildren();
    return;
  }

  const body = parseAndSanitize(html);
  const ownerDocument = container.ownerDocument;
  const adopted = Array.from(body.childNodes, (node) => ownerDocument.importNode(node, true));
  container.replaceChildren(...adopted);
}
