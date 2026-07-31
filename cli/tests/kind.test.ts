import { describe, expect, it } from "vitest";
import { detectArtifactKind } from "../src/kind";

describe("detectArtifactKind", () => {
  it.each([
    ["README.md", { kind: "markdown" }],
    ["changes.patch", { kind: "diff" }],
    ["rows.csv", { kind: "csv" }],
    ["data.json", { kind: "json" }],
    ["main.ts", { kind: "code", language: "typescript" }],
    ["script.lua", { kind: "code", language: "lua" }],
    ["LICENSE", { kind: "code", language: undefined }],
  ] as const)("detects %s", (filename, expected) => {
    expect(detectArtifactKind(filename)).toEqual(expected);
  });

  it("honors an explicit kind", () => {
    expect(detectArtifactKind("notes.txt", "markdown")).toEqual({ kind: "markdown" });
    expect(detectArtifactKind("component.tsx", "code")).toEqual({ kind: "code", language: "tsx" });
  });
});
