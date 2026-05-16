import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const headersPath = join(process.cwd(), "public", "_headers");

function readHeaders() {
  return readFileSync(headersPath, "utf8");
}

describe("static security headers", () => {
  it("configures strict Cloudflare Pages headers for all static routes", () => {
    const headers = readHeaders();

    expect(headers).toContain("/*");
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(headers).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("base-uri 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("Referrer-Policy: no-referrer");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("Permissions-Policy: accelerometer=()");
  });

  it("advertises the precompressed ARX dictionary with Brotli headers", () => {
    const headers = readHeaders();

    expect(headers).toContain("/arx-dictionary.json.br");
    expect(headers).toContain("/arx2-dictionary.json.br");
    expect(headers).toContain("/vendor/diff-view-pure.css.br");
    expect(headers).toContain("Content-Type: application/json; charset=utf-8");
    expect(headers).toContain("Content-Type: text/css; charset=utf-8");
    expect(headers).toContain("Content-Encoding: br");
    expect(headers).toContain("Vary: Accept-Encoding");
  });
});
