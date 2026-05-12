import { describe, expect, it } from "vitest";
import { parseGitPatchBundle } from "@/lib/diff/git-patch";

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
});
