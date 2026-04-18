import { describe, expect, it } from "vitest";

describe("buildAgentRenderLinkHeaderValue", () => {
  it("uses root paths when no base path is set", async () => {
    const { buildAgentRenderLinkHeaderValue } = await import("../scripts/agent-render-link-headers.mjs");
    const value = buildAgentRenderLinkHeaderValue("");
    expect(value).toContain('rel="api-catalog"');
    expect(value).toContain("</.well-known/api-catalog.json>");
    expect(value).toContain('rel="service-desc"');
    expect(value).toContain("</docs/openapi.json>");
    expect(value).toContain('rel="service-doc"');
    expect(value).toContain("</README.md>");
    expect(value).toContain('rel="describedby"');
    expect(value).toContain("</docs/payload-format.md>");
  });

  it("prefixes paths when NEXT_PUBLIC_BASE_PATH-style input is set", async () => {
    const { buildAgentRenderLinkHeaderValue } = await import("../scripts/agent-render-link-headers.mjs");
    const value = buildAgentRenderLinkHeaderValue("/agent-render");
    expect(value).toContain("</agent-render/.well-known/api-catalog.json>");
    expect(value).toContain("</agent-render/docs/openapi.json>");
  });
});
