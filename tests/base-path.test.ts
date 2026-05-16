import { afterEach, describe, expect, it } from "vitest";
import { getConfiguredBasePath, normalizeBasePath, withBasePath } from "@/lib/site/base-path";

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
  process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
});

describe("base path helpers", () => {
  it.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    ["agent-render", "/agent-render"],
    ["/agent-render", "/agent-render"],
    ["/agent-render/", "/agent-render"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it("prefixes asset paths with the normalized public base path", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/agent-render/";

    expect(getConfiguredBasePath()).toBe("/agent-render");
    expect(withBasePath("/icon.svg")).toBe("/agent-render/icon.svg");
    expect(withBasePath("security/")).toBe("/agent-render/security/");
    expect(withBasePath("/")).toBe("/agent-render/");
  });

  it("keeps root deployments root-relative", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/";

    expect(withBasePath("/icon.svg")).toBe("/icon.svg");
    expect(withBasePath("/")).toBe("/");
  });
});
