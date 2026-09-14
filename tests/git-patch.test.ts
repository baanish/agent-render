import { describe, expect, it } from "vitest";
import { getRenderablePatchFiles, parseGitPatchBundle } from "@/lib/diff/git-patch";

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
    const files = parseGitPatchBundle(multiFilePatch);

    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({
      displayPath: "src/alpha.ts",
      status: "modified",
      oldPath: "src/alpha.ts",
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
      oldPath: null,
      newPath: "assets/logo.png",
      isBinary: true,
    });
  });

  it("parses quoted paths and preserves repository paths that start with a/", () => {
    const files = parseGitPatchBundle(`diff --git "a/my file.ts" "b/my file.ts"
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

  it("decodes an escaped backslash before t without turning it into a tab", () => {
    const files = parseGitPatchBundle(String.raw`diff --git "a/dir\\tool.txt" "b/dir\\tool.txt"
--- "a/dir\\tool.txt"
+++ "b/dir\\tool.txt"
@@ -1 +1 @@
-old
+new
`);

    expect(files[0]?.displayPath).toBe("dir\\tool.txt");
  });

  it("rejects an unterminated quoted git path without regex backtracking", () => {
    const patch = `diff --git "a/${"\\!".repeat(10_000)} b/file.ts\n`;

    expect(getRenderablePatchFiles(parseGitPatchBundle(patch))).toEqual([]);
  });

  it("rejects malformed hunk headers before rich diff rendering", () => {
    expect(() =>
      parseGitPatchBundle(`diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ nope @@
-export const alpha = 1;
+export const alpha = 2;
`),
    ).toThrow(/invalid hunk header/i);
  });

  it("ignores malformed hunk-like prose in a leading preamble", () => {
    const files = getRenderablePatchFiles(parseGitPatchBundle(`Subject: review notes
@@ this is prose @@

diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-old
+new
`));

    expect(files.map((file) => file.displayPath)).toEqual(["src/alpha.ts"]);
  });

  it("keeps leading patch preambles as their own section", () => {
    const files = parseGitPatchBundle(`From 123 Mon Sep 17 00:00:00 2001
Subject: [PATCH] preserve preamble

diff --git a/src/alpha.ts b/src/alpha.ts
--- a/src/alpha.ts
+++ b/src/alpha.ts
@@ -1 +1 @@
-export const alpha = 1;
+export const alpha = 2;
`);

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      displayPath: "file-1",
      patch: expect.stringContaining("Subject: [PATCH] preserve preamble"),
    });
    expect(files[1]).toMatchObject({
      displayPath: "src/alpha.ts",
    });
  });

  it("keeps preambles out of renderable files without dropping traditional diffs", () => {
    const patch = `From 123 Mon Sep 17 00:00:00 2001
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
`;

    const files = getRenderablePatchFiles(parseGitPatchBundle(patch));

    expect(files.map((file) => file.displayPath)).toEqual(["src/alpha.ts"]);
  });

  it("separates an email preamble from a following traditional diff", () => {
    const patch = `Subject: [PATCH] mixed formats

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
`;

    const files = getRenderablePatchFiles(parseGitPatchBundle(patch));

    expect(files.map((file) => file.displayPath)).toEqual(["legacy.txt", "src/alpha.ts"]);
    expect(files[0]?.patch.startsWith("--- a/legacy.txt")).toBe(true);
  });

  it("does not split adjacent --- and +++ content lines inside a hunk", () => {
    const patch = `--- a/first.txt
+++ b/first.txt
@@ -1 +1 @@
--- removed
+++ added
--- a/second.txt
+++ b/second.txt
@@ -1 +1 @@
-old
+new
`;

    const files = getRenderablePatchFiles(parseGitPatchBundle(patch));

    expect(files.map((file) => file.displayPath)).toEqual(["first.txt", "second.txt"]);
    expect(files[0]?.patch).toContain("--- removed\n+++ added");
  });

  it("rejects hunk bodies that do not match their declared counts", () => {
    expect(() =>
      parseGitPatchBundle(`--- a/short.txt
+++ b/short.txt
@@ -1,2 +1 @@
-only one old line
+one new line
`),
    ).toThrow(/shorter than its declared line counts/i);

    expect(() =>
      parseGitPatchBundle(`--- a/long.txt
+++ b/long.txt
@@ -1 +1 @@
-old
+new
+undeclared
`),
    ).toThrow(/exceeds its declared line counts/i);
  });

  it("accepts a format-patch signature trailer after the final hunk", () => {
    const files = parseGitPatchBundle(`--- a/one.txt
+++ b/one.txt
@@ -1 +1 @@
-old
+new
-- 
2.34.1

`);
    expect(files.map((file) => file.newPath)).toEqual(["one.txt"]);
  });

  it("keeps a traditional unified diff before a git-style section", () => {
    const patch = `--- a/legacy.txt
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
`;

    const files = getRenderablePatchFiles(parseGitPatchBundle(patch));

    expect(files.map((file) => file.displayPath)).toEqual(["legacy.txt", "src/alpha.ts"]);
  });

  it("does not expose plain text as a renderable patch file", () => {
    expect(getRenderablePatchFiles(parseGitPatchBundle("plain review notes"))).toEqual([]);
  });

  it("falls back to a file-N label when a rename target strips to an empty path", () => {
    // `rename to a/` reduces to "" after stripping the a/ prefix; the display label must not be
    // empty and the id must not be degenerate ("-0"). Fuzz regression (git-patch parser).
    const files = parseGitPatchBundle("rename to a/");

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ displayPath: "file-1", id: "file-1-0" });
    expect(files[0].displayPath).not.toBe("");
  });
});
