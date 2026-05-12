import { brotliDecompressSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("diff stylesheet asset", () => {
  it("keeps the deferred public stylesheet in sync with the diff-view package", () => {
    const packageStylesheet = readFileSync(
      resolve("node_modules/@git-diff-view/react/styles/diff-view-pure.css"),
      "utf-8",
    );
    const publicStylesheet = readFileSync(
      resolve("public/vendor/diff-view-pure.css"),
      "utf-8",
    );

    expect(publicStylesheet).toBe(packageStylesheet);
  });

  it("keeps the precompressed deferred stylesheet in sync with the plain asset", () => {
    const publicStylesheet = readFileSync(
      resolve("public/vendor/diff-view-pure.css"),
      "utf-8",
    );
    const compressedStylesheet = readFileSync(
      resolve("public/vendor/diff-view-pure.css.br"),
    );

    expect(brotliDecompressSync(compressedStylesheet).toString("utf-8")).toBe(publicStylesheet);
  });
});
