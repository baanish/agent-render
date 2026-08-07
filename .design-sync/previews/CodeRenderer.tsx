import { CodeRenderer, sampleEnvelopes } from "agent-render";

const codecExcerpt = sampleEnvelopes[4].artifacts[1];

/** Canonical: a TypeScript source file with the full toolbar chrome. */
export const TypeScriptSource = () => <CodeRenderer artifact={codecExcerpt} />;

/** Compact variant, as used for code fences embedded inside markdown. */
export const CompactSnippet = () => (
  <CodeRenderer
    compact
    artifact={{
      id: "viewer-shell",
      kind: "code",
      title: "viewer-shell.tsx",
      filename: "viewer-shell.tsx",
      language: "tsx",
      content:
        'export function ViewerShell() {\n  return <main>Fragment-powered artifact viewer shell</main>;\n}',
    }}
  />
);

/** Non-TS language for the language chip + highlighter sweep. */
export const PythonScript = () => (
  <CodeRenderer
    artifact={{
      id: "bench",
      kind: "code",
      title: "bench_codecs.py",
      filename: "bench_codecs.py",
      language: "python",
      content:
        'import json\nfrom pathlib import Path\n\n\ndef load_baseline(path: Path) -> dict[str, int]:\n    """Load the codec benchmark baseline committed by npm run bench:codecs."""\n    data = json.loads(path.read_text())\n    return {row["codec"]: row["visible_chars"] for row in data["corpus"]}\n\n\nif __name__ == "__main__":\n    baseline = load_baseline(Path("scripts/bench-baseline.json"))\n    for codec, chars in sorted(baseline.items()):\n        print(f"{codec:>8}: {chars:,} visible chars")',
    }}
  />
);
