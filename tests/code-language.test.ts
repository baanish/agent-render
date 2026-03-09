import { describe, expect, it } from "vitest";
import { detectCodeLanguage, getLanguageSupport } from "@/lib/code/language";

describe("code language detection", () => {
  it("prefers explicit language hints", () => {
    expect(detectCodeLanguage("example.txt", "json")).toBe("json");
  });

  it("detects common filename extensions", () => {
    expect(detectCodeLanguage("viewer-shell.tsx")).toBe("tsx");
    expect(detectCodeLanguage("config.yaml")).toBe("yaml");
    expect(detectCodeLanguage("README.md")).toBe("markdown");
  });

  it("returns null support for unknown languages", () => {
    expect(getLanguageSupport("unknown-language")).toBeNull();
  });
});
