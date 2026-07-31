import { describe, expect, it } from "vitest";

import { sanitizeKitHtml } from "@/lib/html/sanitize-kit-html";

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

  it("unwraps unknown tags but keeps their sanitized children", () => {
    const output = sanitizeKitHtml("<custom-widget><p onclick=\"x()\">inner</p></custom-widget>");
    expect(output).toBe("<p>inner</p>");
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

  it("keeps kit structure: tables, details, data-ar-* and aria attributes", () => {
    const input =
      '<div class="ar-tabs"><div class="ar-tab" data-ar-tab="One" aria-label="first"><table><thead><tr><th scope="col">h</th></tr></thead><tbody><tr><td>v</td></tr></tbody></table></div></div><details open=""><summary>More</summary><p>body</p></details>';
    expect(sanitizeKitHtml(input)).toBe(input);
  });

  it("removes HTML comments", () => {
    expect(sanitizeKitHtml("<p>a</p><!-- hidden note --><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });
});
