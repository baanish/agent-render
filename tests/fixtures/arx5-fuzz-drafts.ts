import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { LinkCreatorDraft } from "@/lib/payload/link-creator";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const benchReport = readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8");

function draft(
  kind: LinkCreatorDraft["kind"],
  title: string,
  content: string,
  extra: Partial<LinkCreatorDraft> = {},
): LinkCreatorDraft {
  const extension =
    kind === "markdown" ? "md" : kind === "code" ? "txt" : kind === "diff" ? "patch" : kind === "csv" ? "csv" : "json";
  return {
    kind,
    title,
    filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact"}.${extension}`,
    content,
    language: "",
    diffView: "unified",
    ...extra,
  };
}

function hexWall(bytes: number, seed: string): string {
  let out = "";
  let index = 0;
  while (out.length < bytes) {
    out += createHash("sha256").update(`${seed}:${index}`).digest("hex");
    index += 1;
  }
  return out.slice(0, bytes);
}

function patch(path: string, oldLines: string[], newLines: string[]): string {
  const oldBody = oldLines.map((line) => `-${line}`).join("\n");
  const newBody = newLines.map((line) => `+${line}`).join("\n");
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    oldBody,
    newBody,
    "",
  ].join("\n");
}

/** 48 varied single-artifact drafts plus two multi-artifact envelopes. */
export const fuzzDrafts: LinkCreatorDraft[] = [
  draft("markdown", "One liner", "# Hi\n"),
  draft("markdown", "GFM table", "# Status\n\n| Surface | State |\n| --- | --- |\n| Discord | ok |\n| WhatsApp | ok |\n"),
  draft("markdown", "Task list", "- [x] Ship arx5\n- [ ] Hide arx3\n- [ ] Hide arx4\n"),
  draft(
    "markdown",
    "Mermaid flow",
    "```mermaid\nflowchart LR\n  A[Draft] --> B[arx5]\n  B --> C[Discord]\n```\n",
  ),
  draft(
    "markdown",
    "Release notes",
    "# 1.4.0\n\n## Added\n\n- arx5 honest transport scoring\n\n## Deprecated\n\n- arx3 and arx4 emit\n\n```ts\nexport const tag = \"f\";\n```\n",
  ),
  draft("markdown", "Accented prose", "Café résumé naïve Zürich. El niño comió piña.\n"),
  draft("markdown", "CJK brief", "# 概要\n\nエージェント出力を静的なフラグメントで共有する。\n\n- 圧縮\n- 復号\n"),
  draft("markdown", "Arabic note", "هذا رابط للمشاركة بدون خادم.\n"),
  draft("markdown", "Emoji punch", "Ship it 🚀 then paste in Discord 📎 — no tofu.\n"),
  draft("markdown", "Nested lists", "1. Protocol\n   1. fragment\n   2. envelope\n2. Renderers\n   - markdown\n   - code\n"),
  draft("markdown", "Quoted spec", "> Artifact payloads live in the URL fragment.\n\nSee [docs](https://example.com/docs).\n"),
  draft("markdown", "Bench excerpt", benchReport.slice(0, 2400)),
  draft("markdown", "Repeated contract", `${"Keep the fragment client-side.\n".repeat(80)}`),
  draft("markdown", "Incompressible wall", `# Digests\n\n${hexWall(1800, "md")}`),
  draft("code", "Tiny TS", "export const ok = true;\n", { language: "ts", filename: "ok.ts" }),
  draft(
    "code",
    "Wire picker",
    "export function selectWire(candidates: { length: number }[]) {\n  return candidates.reduce((best, next) => (next.length < best.length ? next : best));\n}\n",
    { language: "ts", filename: "wire.ts" },
  ),
  draft(
    "code",
    "Python parse",
    "def parse_row(line: str) -> list[str]:\n    return [cell.strip() for cell in line.split(\",\")]\n\nprint(parse_row(\"a,b,c\"))\n",
    { language: "python", filename: "parse.py" },
  ),
  draft(
    "code",
    "Rust match",
    "fn codec_tag(name: &str) -> char {\n    match name {\n        \"arx5\" => 'f',\n        \"arx2\" => 'b',\n        _ => 'p',\n    }\n}\n",
    { language: "rust", filename: "tag.rs" },
  ),
  draft(
    "code",
    "Go handler",
    "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"fragment ready\")\n}\n",
    { language: "go", filename: "main.go" },
  ),
  draft(
    "code",
    "SQL rollup",
    "SELECT kind, COUNT(*) AS n\nFROM artifacts\nWHERE codec IN ('arx2', 'arx5')\nGROUP BY kind\nORDER BY n DESC;\n",
    { language: "sql", filename: "rollup.sql" },
  ),
  draft(
    "code",
    "Regex heavy",
    "const FRAGMENT = /^#([pldabcef])([A-Za-z0-9._~-]+)$/;\nexport const match = (hash: string) => FRAGMENT.exec(hash);\n",
    { language: "ts", filename: "re.ts" },
  ),
  draft(
    "code",
    "Comment novel",
    `${"// Keep dictionary pins exact. A skewed overlay mints an undecodable mixer link.\n".repeat(40)}export const pin = 1;\n`,
    { language: "ts", filename: "pins.ts" },
  ),
  draft("code", "Shell install", "#!/bin/sh\nset -eu\nnpm ci\nnpm run check\n", { language: "bash", filename: "ci.sh" }),
  draft("code", "Minified-ish", "export function x(a,b,c){return a<b?c(a):c(b)}\n", { language: "js", filename: "x.js" }),
  draft("diff", "Small greet", patch("src/hello.ts", ["export function greet() {", "  return 'hello';", "}"], ["export function greet(name: string) {", "  return `hello, ${name}`;", "}"])),
  draft(
    "diff",
    "Multi file",
    `${patch("src/a.ts", ["export const a = 1;"], ["export const a = 2;"])}${patch("src/b.ts", ["export const b = 1;"], ["export const b = 3;"])}`,
  ),
  draft(
    "diff",
    "New file",
    "diff --git a/src/version.ts b/src/version.ts\nnew file mode 100644\nindex 0000000..3333333\n--- /dev/null\n+++ b/src/version.ts\n@@ -0,0 +1 @@\n+export const version = '0.1.0';\n",
  ),
  draft(
    "diff",
    "Delete file",
    "diff --git a/src/legacy.ts b/src/legacy.ts\ndeleted file mode 100644\nindex 3333333..0000000\n--- a/src/legacy.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const legacy = true;\n",
  ),
  draft("diff", "Whitespace only", patch("src/pad.ts", ["export const value = 1;"], ["export const value = 1; "])),
  draft(
    "diff",
    "Rename hint",
    "diff --git a/src/old-name.ts b/src/new-name.ts\nsimilarity index 100%\nrename from src/old-name.ts\nrename to src/new-name.ts\n",
  ),
  draft(
    "diff",
    "Large hunk",
    patch(
      "src/list.ts",
      Array.from({ length: 20 }, (_, index) => `  item${index},`),
      Array.from({ length: 24 }, (_, index) => `  item${index},`),
    ),
  ),
  draft("csv", "Tiny table", "name,ok\nviewer,true\n"),
  draft("csv", "Quoted commas", 'title,note\n"Big, link","uses, commas"\n"Second, row","still, quoted"\n'),
  draft(
    "csv",
    "Wide metrics",
    `kind,codec,visible,transport,ascii,discord\n${["markdown", "code", "diff", "csv", "json"].map((kind, index) => `${kind},arx5,${200 + index},${210 + index},true,ok`).join("\n")}\n`,
  ),
  draft("csv", "Sparse grid", "a,b,c,d,e\n1,,,,\n,,3,,\n,,,,5\n"),
  draft("csv", "Numeric series", `n,value\n${Array.from({ length: 40 }, (_, index) => `${index},${(index * 1.7).toFixed(3)}`).join("\n")}\n`),
  draft("csv", "Unicode headers", "名前,状態\nビューア,準備完了\n"),
  draft(
    "csv",
    "Unique tokens",
    `id,token\n${Array.from({ length: 30 }, (_, index) => `${index},${hexWall(16, `csv${index}`)}`).join("\n")}\n`,
  ),
  draft("csv", "Long row", `col,payload\n1,"${"cell ".repeat(80).trim()}"\n`),
  draft("json", "Flat flags", '{\n  "codec": "arx5",\n  "ascii": true\n}\n'),
  draft(
    "json",
    "Nested config",
    JSON.stringify(
      {
        transport: { method: "fragment", tag: "f" },
        limits: { fragment: 8192, decoded: 200000, discord: 2000 },
      },
      null,
      2,
    ),
  ),
  draft(
    "json",
    "Array of objects",
    JSON.stringify(
      [
        { id: "a", kind: "markdown" },
        { id: "b", kind: "code" },
        { id: "c", kind: "csv" },
      ],
      null,
      2,
    ),
  ),
  draft(
    "json",
    "Package slice",
    JSON.stringify(
      {
        name: "agent-render",
        scripts: { test: "vitest run", e2e: "playwright test" },
        dependencies: { next: "15.1.11", react: "19.1.0" },
      },
      null,
      2,
    ),
  ),
  draft("json", "Unicode keys", JSON.stringify({ 概要: "静的", café: "ok" }, null, 2)),
  draft("json", "Scalars", JSON.stringify({ n: 0, flag: false, empty: null, ratio: 1.25 }, null, 2)),
  draft(
    "json",
    "Deep nest",
    JSON.stringify({ a: { b: { c: { d: { e: { tag: "f", prior: "j" } } } } } }, null, 2),
  ),
  draft("json", "Compact blob", JSON.stringify({ tokens: Array.from({ length: 20 }, (_, index) => hexWall(8, `j${index}`) ) })),
  draft("json", "Pretty repeated", `${JSON.stringify({ keep: "fragment client-side", codec: "arx5" }, null, 2)}\n`.repeat(12)),
  draft("markdown", "Bracket title [beta]", "Notes with a title that markdown must escape.\n"),
  draft("markdown", "Very long title for a markdown label that eats Discord budget", "Short body. The label is the variable.\n"),
];

export const fuzzBundles: PayloadEnvelope[] = [
  {
    v: 1,
    codec: "plain",
    title: "Mixed bundle",
    activeArtifactId: "notes",
    artifacts: [
      { id: "notes", kind: "markdown", title: "Notes", filename: "notes.md", content: "# Bundle\n\nTwo artifacts.\n" },
      { id: "code", kind: "code", title: "code.ts", filename: "code.ts", language: "ts", content: "export const n = 2;\n" },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "Triple bundle",
    activeArtifactId: "table",
    artifacts: [
      { id: "table", kind: "csv", title: "table.csv", filename: "table.csv", content: "k,v\narx5,1\n" },
      { id: "spec", kind: "json", title: "spec.json", filename: "spec.json", content: '{"k":"v"}\n' },
      {
        id: "patch",
        kind: "diff",
        title: "change.patch",
        filename: "change.patch",
        patch: patch("a.txt", ["old"], ["new"]),
      },
    ],
  },
];
