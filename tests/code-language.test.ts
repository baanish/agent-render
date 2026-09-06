import { describe, expect, it } from "vitest";
import { detectCodeLanguage, toPierreLanguage } from "@/lib/code/language";

describe("code language detection", () => {
  it("prefers explicit language hints", () => {
    expect(detectCodeLanguage("example.txt", "json")).toBe("json");
  });

  it("detects common filename extensions", () => {
    expect(detectCodeLanguage("viewer-shell.tsx")).toBe("tsx");
    expect(detectCodeLanguage("config.yaml")).toBe("yaml");
    expect(detectCodeLanguage("README.md")).toBe("markdown");
  });

  it("passes through languages and aliases Shiki resolves", () => {
    expect(toPierreLanguage("tsx")).toBe("tsx");
    expect(toPierreLanguage("py")).toBe("py");
    expect(toPierreLanguage("shell")).toBe("shell");
    expect(toPierreLanguage("text")).toBe("text");
  });

  it("falls back to text for languages Pierre cannot resolve", () => {
    // `resolveLanguage` throws on unknown ids; `plain` is a codec name that can
    // reach `language` through metadata, not a Shiki grammar.
    expect(toPierreLanguage("plain")).toBe("text");
    expect(toPierreLanguage("not-a-real-grammar")).toBe("text");
  });
});
