import { describe, expect, it } from "vitest";

import { MAX_KIT_HTML_DEPTH, sanitizeKitHtml, sanitizeKitHtmlInto } from "@/lib/html/sanitize-kit-html";

describe("sanitizeKitHtmlInto", () => {
  it("adopts sanitized nodes into the container without a string round trip", () => {
    const container = document.createElement("div");
    sanitizeKitHtmlInto(container, '<div class="ar-card">safe</div><script>alert(1)</script>');
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".ar-card")?.textContent).toBe("safe");
  });

  it("replaces prior children on each call", () => {
    const container = document.createElement("div");
    sanitizeKitHtmlInto(container, "<p>first</p>");
    sanitizeKitHtmlInto(container, "<p>second</p>");
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).toBe("second");
  });
});

describe("sanitizeKitHtml", () => {
  it("removes script elements and their content", () => {
    const output = sanitizeKitHtml('<div class="ar-card">safe</div><script>alert(1)</script>');
    expect(output).toBe('<div class="ar-card">safe</div>');
  });

  it("removes style elements and inline style attributes", () => {
    const output = sanitizeKitHtml('<style>body{display:none}</style><p style="position:fixed">text</p>');
    expect(output).toBe("<p>text</p>");
  });

  it("strips event handler attributes", () => {
    const output = sanitizeKitHtml('<div class="ar-card" onclick="alert(1)" onmouseover="x()">text</div>');
    expect(output).toBe('<div class="ar-card">text</div>');
  });

  it("strips javascript: hrefs but keeps https and mailto links", () => {
    expect(sanitizeKitHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeKitHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
    expect(sanitizeKitHtml('<a href="mailto:a@b.c">x</a>')).toBe('<a href="mailto:a@b.c">x</a>');
  });

  it("drops http and bare-fragment hrefs (cleartext downgrade and shell hash takeover)", () => {
    expect(sanitizeKitHtml('<a href="http://example.com">x</a>')).toBe("<a>x</a>");
    expect(sanitizeKitHtml('<a href="#pAttackerFragment">x</a>')).toBe("<a>x</a>");
  });

  it("rejects userinfo and embedded control characters in hrefs", () => {
    // Userinfo is the classic display spoof: the label reads apple.com, the host is evil.example.
    expect(sanitizeKitHtml('<a href="https://apple.com@evil.example">x</a>')).toBe("<a>x</a>");
    // Parsers strip whitespace and controls before resolving, so a tab could smuggle a scheme past
    // a check that only inspected the raw string.
    expect(sanitizeKitHtml('<a href="java\tscript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeKitHtml('<a href="https://exa\nmple.com">x</a>')).toBe("<a>x</a>");
    // A scheme with no host resolves nowhere useful and is rejected rather than passed through.
    expect(sanitizeKitHtml('<a href="https://">x</a>')).toBe("<a>x</a>");
  });

  it("keeps scheme-relative https forms the URL parser normalizes to a real host", () => {
    // `https:example.com` parses to https://example.com/. It looks odd but resolves to an ordinary
    // https link, and the policy allows https to any host, so stripping it would be theatre.
    expect(sanitizeKitHtml('<a href="https:example.com">x</a>')).toBe('<a href="https:example.com">x</a>');
  });

  it("forces noopener rel on target=_blank links and drops other targets", () => {
    expect(sanitizeKitHtml('<a href="https://example.com" target="_blank">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeKitHtml('<a href="https://example.com" target="parent-frame">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
  });

  it("removes form controls entirely", () => {
    const output = sanitizeKitHtml('<form action="https://evil.example"><input name="password"><button>Log in</button></form><p>after</p>');
    expect(output).toBe("<p>after</p>");
  });

  it("removes iframe, object, and svg subtrees", () => {
    const output = sanitizeKitHtml('<iframe src="https://evil.example"></iframe><object></object><svg><script>1</script></svg><p>kept</p>');
    expect(output).toBe("<p>kept</p>");
  });

  it("drops id and name attributes to prevent DOM clobbering", () => {
    const output = sanitizeKitHtml('<div id="__AGENT_RENDER_PAYLOAD__" class="ar-card">x</div>');
    expect(output).toBe('<div class="ar-card">x</div>');
  });

  it("drops unknown tags and their subtree (default-deny)", () => {
    expect(sanitizeKitHtml("<custom-widget><p>inner</p></custom-widget><p>kept</p>")).toBe("<p>kept</p>");
  });

  it("drops nesting past the depth cap instead of overflowing the stack", () => {
    const depth = MAX_KIT_HTML_DEPTH + 500;
    const deep = "<div>".repeat(depth) + "boom" + "</div>".repeat(depth);
    const output = sanitizeKitHtml(deep);
    // The call returns rather than throwing RangeError, and the tree is truncated at the cap.
    expect(output.split("<div>").length - 1).toBe(MAX_KIT_HTML_DEPTH);
  });

  it("keeps https and data:image sources on images, drops http", () => {
    expect(sanitizeKitHtml('<img src="https://example.com/a.png" alt="a">')).toBe(
      '<img src="https://example.com/a.png" alt="a" loading="lazy">',
    );
    expect(sanitizeKitHtml('<img src="http://example.com/a.png" alt="a">')).toBe('<img alt="a" loading="lazy">');
    expect(sanitizeKitHtml('<img src="data:image/png;base64,AAAA">')).toBe(
      '<img src="data:image/png;base64,AAAA" loading="lazy">',
    );
    expect(sanitizeKitHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img loading="lazy">');
  });

  it("keeps the documented ar-choices markup intact", () => {
    // The kit component is the contract agents author against (docs/design-kit.md): the id badge is
    // generated from data-ar-id by CSS, so losing that attribute would silently drop the option ids
    // the reader is meant to reply with.
    const input =
      '<ol class="ar-choices"><li data-ar-id="a">Fix the TTL off-by-one<small>Sweeper deletes an hour early.</small></li><li data-ar-id="b">Document the auth header</li></ol>';
    expect(sanitizeKitHtml(input)).toBe(input);
  });

  it("keeps kit structure: tables, details, data-ar-* and aria attributes", () => {
    const input =
      '<div class="ar-tabs"><div class="ar-tab" data-ar-tab="One" aria-label="first"><table><thead><tr><th scope="col">h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table></div></div><details open=""><summary>More</summary><p>body</p></details>';
    expect(sanitizeKitHtml(input)).toBe(input);
  });

  it("removes HTML comments", () => {
    expect(sanitizeKitHtml("<p>a</p><!-- hidden note --><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });
});
