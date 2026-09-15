import { describe, expect, it } from "vitest";
import {
  getPatchFileLabels,
  parseRenderablePatchFiles,
} from "@/lib/diff/git-patch";

const multiFilePatch = `diff --git a/src/alpha.ts b/src/alpha.ts
index 1111111..2222222 100644
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-export const alpha = 1;
+export const alpha = 2;
diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/assets/logo.png differ
`;

describe("git patch parsing", () => {
  it("parses a multi-file patch into separate file entries", () => {
    const files = parseRenderablePatchFiles(multiFilePatch);

    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({
      displayPath: "src/alpha.ts",
      status: "modified",
      oldPath: null,
      newPath: "src/alpha.ts",
    });
    expect(files[1]).toMatchObject({
      displayPath: "src/new-name.ts",
      status: "renamed",
      oldPath: "src/old-name.ts",
      newPath: "src/new-name.ts",
    });
    expect(files[2]).toMatchObject({
      displayPath: "assets/logo.png",
      status: "binary",
      isBinary: true,
    });
  });

  it("parses quoted paths and preserves repository paths that start with a/", () => {
    const files = parseRenderablePatchFiles(`diff --git "a/my file.ts" "b/my file.ts"
--- "a/my file.ts"
+++ "b/my file.ts"
@@ -1 +1 @@
-old
+new
diff --git a/a/nested.ts b/a/nested.ts
--- a/a/nested.ts
+++ b/a/nested.ts
@@ -1 +1 @@
-old
+new
`);

    expect(files.map((file) => file.displayPath)).toEqual(["my file.ts", "a/nested.ts"]);
  });

  it("keeps rename-only files whose unquoted paths contain spaces", () => {
    const files = parseRenderablePatchFiles(`diff --git a/old name.txt b/new name.txt
similarity index 100%
rename from old name.txt
rename to new name.txt
diff --git a/normal.txt b/normal.txt
index 111..222 100644
--- a/normal.txt
+++ b/normal.txt
@@ -1 +1 @@
-old
+new
`);

    expect(files.map((file) => file.displayPath)).toEqual([
      "new name.txt",
      "normal.txt",
    ]);
    expect(files[0]?.status).toBe("renamed");
    expect(files[0]?.oldPath).toBe("old name.txt");
  });

  it("keeps email preambles out of the file list", () => {
    const files = parseRenderablePatchFiles(`From 123 Mon Sep 17 00:00:00 2001
Subject: [PATCH] preserve preamble

diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-export const alpha = 1;
+export const alpha = 2;
`);

    expect(files.map((file) => file.displayPath)).toEqual(["src/alpha.ts"]);
  });

  it("keeps a traditional unified diff before a git-style section", () => {
    const files = parseRenderablePatchFiles(`Subject: [PATCH] mixed formats

--- a/legacy.txt
+++ b/legacy.txt
@@ -1 +1 @@
-old
+new
diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-old
+new
`);

    expect(files.map((file) => file.displayPath)).toEqual(["legacy.txt", "src/alpha.ts"]);
    expect(files[0]?.startLine).toBeLessThan(files[1]?.startLine ?? 0);
  });

  it("keeps prose-shaped hunk headers in a preamble from creating files", () => {
    const files = parseRenderablePatchFiles(`From 123 Mon Sep 17 00:00:00 2001
Subject: [PATCH] quoted review

The review mentioned these separately:
--- a/not-a-header.ts
some prose
+++ b/not-a-header.ts
@@ -1 +1 @@

diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-old
+new
`);

    expect(files.map((file) => file.displayPath)).toEqual(["src/alpha.ts"]);
  });

  it("throws on malformed hunk counts so callers fall back to raw", () => {
    expect(() =>
      parseRenderablePatchFiles(`--- a/short.txt
+++ b/short.txt
@@ -1,2 +1 @@
-only one old line
+one new line
`),
    ).toThrow();

    expect(() =>
      parseRenderablePatchFiles(`--- a/long.txt
+++ b/long.txt
@@ -1 +1 @@
-old
+new
+undeclared
`),
    ).toThrow();
  });

  it("rejects a blank unprefixed line inside a hunk body", () => {
    // The empty line between the two change lines must not count as context;
    // without a leading space the hunk is malformed and the patch falls back.
    expect(() =>
      parseRenderablePatchFiles(`diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
-old

+new
`),
    ).toThrow();
  });

  it("accepts a format-patch signature trailer after the final hunk", () => {
    const files = parseRenderablePatchFiles(`--- a/one.txt
+++ b/one.txt
@@ -1 +1 @@
-old
+new
-- 
2.34.1

`);

    expect(files.map((file) => file.newPath)).toEqual(["one.txt"]);
  });

  it("accepts a hunk whose final context line is a blank line", () => {
    const files = parseRenderablePatchFiles(`diff --git a/note.txt b/note.txt
index 111..222 100644
--- a/note.txt
+++ b/note.txt
@@ -1,2 +1,2 @@
-before
+after
 
`);

    expect(files.map((file) => file.newPath)).toEqual(["note.txt"]);
  });

  it("marks binary file sections and synthesizes an entry for a bare binary patch", () => {
    const files = parseRenderablePatchFiles("GIT binary patch\nliteral 4\nLc!NkF#\n\n");

    expect(files).toHaveLength(1);
    expect(files[0]?.isBinary).toBe(true);
    expect(files[0]?.status).toBe("binary");
  });

  it("does not expose plain text as a renderable patch file", () => {
    expect(parseRenderablePatchFiles("plain review notes")).toEqual([]);
    expect(parseRenderablePatchFiles("")).toEqual([]);
  });

  it("records one-based section start lines for editor navigation", () => {
    const files = parseRenderablePatchFiles(`diff --git a/first.txt b/first.txt
--- a/first.txt
+++ b/first.txt
@@ -1 +1 @@
-a
+b
diff --git a/second.txt b/second.txt
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-c
+d
`);

    expect(files[0]?.startLine).toBe(1);
    expect(files[1]?.startLine).toBe(7);
  });

  it("does not let hunk content fake a traditional section start", () => {
    // The removed `-- x` and added `++ y` lines inside the first hunk read as a
    // `--- `/`+++ ` pair; without hunk tracking the second file's startLine
    // would point at that fake triple instead of its real header on line 13.
    const files = parseRenderablePatchFiles(`--- a/f1.txt
+++ b/f1.txt
@@ -1,3 +1,4 @@
 base
 mid
--- x
+++ y
+z
@@ -10,2 +10,2 @@
 f
-g
+h
--- a/f2.txt
+++ b/f2.txt
@@ -1 +1 @@
-old
+new
`);

    expect(files.map((file) => file.displayPath)).toEqual(["f1.txt", "f2.txt"]);
    expect(files[0]?.startLine).toBe(1);
    expect(files[1]?.startLine).toBe(13);
  });

  it("dedupes repeated paths into unique labels", () => {
    const files = parseRenderablePatchFiles(`diff --git a/x.txt b/x.txt
--- a/x.txt
+++ b/x.txt
@@ -1 +1 @@
-a
+b
diff --git a/x.txt b/x.txt
--- a/x.txt
+++ b/x.txt
@@ -1 +1 @@
-c
+d
`);

    const labels = getPatchFileLabels(files);
    expect(labels.get(files[0]?.id ?? "")).toBe("x.txt");
    expect(labels.get(files[1]?.id ?? "")).toBe("x.txt (2)");
  });
});
