import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { fuzzBundles, fuzzDrafts } from "./fixtures/arx5-fuzz-drafts";
import { DISCORD_MESSAGE_MAX_LENGTH } from "@/lib/markdown-link";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync } from "@/lib/payload/fragment";
import {
  createGeneratedArtifactLinkAsync,
  createGeneratedEnvelopeLinkAsync,
  type GeneratedArtifactLink,
  type LinkCreatorDraft,
} from "@/lib/payload/link-creator";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const BASE_URL = "https://agent-render.com/";
const LIVE_AUTO_CODECS = new Set(["arx5", "arx2"]);

type FuzzRow = {
  name: string;
  kind: string;
  autoCodec: string;
  autoMarkdown: number;
  arx2Markdown: number;
  arx4Markdown: number;
  vsArx2: number;
  vsArx4: number;
  discordOk: boolean;
  asciiMarkdown: boolean;
};

const rows: FuzzRow[] = [];

function markdownFragment(link: GeneratedArtifactLink): string {
  return link.markdownUrl.slice(link.markdownUrl.indexOf("#") + 1);
}

function isChatSafeAsciiFragment(fragment: string): boolean {
  return /^[A-Za-z0-9._~-]+$/.test(fragment);
}

function percentEncodedPasteLength(link: GeneratedArtifactLink): number {
  return new URL(link.url).toString().length;
}

async function measureDraft(draft: LinkCreatorDraft): Promise<FuzzRow> {
  const [auto, arx2, arx4] = await Promise.all([
    createGeneratedArtifactLinkAsync({ ...draft, codec: "auto" }, BASE_URL),
    createGeneratedArtifactLinkAsync({ ...draft, codec: "arx2" }, BASE_URL),
    createGeneratedArtifactLinkAsync({ ...draft, codec: "arx4" }, BASE_URL),
  ]);

  const autoFragment = markdownFragment(auto);
  const parsed = await decodeFragmentAsync(`#${autoFragment}`);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    const expected = draft.kind === "diff" ? { patch: draft.content } : { content: draft.content };
    expect(parsed.envelope.artifacts[0]).toMatchObject(expected);
  }

  expect(LIVE_AUTO_CODECS.has(auto.codec)).toBe(true);
  expect(isChatSafeAsciiFragment(autoFragment)).toBe(true);
  expect(auto.markdownLinkLength).toBe(auto.markdownLink.length);
  expect(auto.markdownLinkLength).toBeLessThanOrEqual(arx4.markdownLinkLength);

  return {
    name: draft.title,
    kind: draft.kind,
    autoCodec: auto.codec,
    autoMarkdown: auto.markdownLinkLength,
    arx2Markdown: arx2.markdownLinkLength,
    arx4Markdown: arx4.markdownLinkLength,
    vsArx2: Number((((arx2.markdownLinkLength - auto.markdownLinkLength) / arx2.markdownLinkLength) * 100).toFixed(2)),
    vsArx4: Number((((arx4.markdownLinkLength - auto.markdownLinkLength) / arx4.markdownLinkLength) * 100).toFixed(2)),
    discordOk: auto.markdownLinkLength <= DISCORD_MESSAGE_MAX_LENGTH,
    asciiMarkdown: isChatSafeAsciiFragment(autoFragment),
  };
}

async function measureBundle(envelope: PayloadEnvelope): Promise<FuzzRow> {
  const [auto, arx2, arx4] = await Promise.all([
    createGeneratedEnvelopeLinkAsync(envelope, BASE_URL, "auto"),
    createGeneratedEnvelopeLinkAsync(envelope, BASE_URL, "arx2"),
    createGeneratedEnvelopeLinkAsync(envelope, BASE_URL, "arx4"),
  ]);

  const autoFragment = markdownFragment(auto);
  const parsed = await decodeFragmentAsync(`#${autoFragment}`);
  expect(parsed.ok).toBe(true);
  expect(LIVE_AUTO_CODECS.has(auto.codec)).toBe(true);
  expect(isChatSafeAsciiFragment(autoFragment)).toBe(true);
  expect(auto.markdownLinkLength).toBeLessThanOrEqual(arx4.markdownLinkLength);

  return {
    name: envelope.title ?? envelope.activeArtifactId ?? "bundle",
    kind: "bundle",
    autoCodec: auto.codec,
    autoMarkdown: auto.markdownLinkLength,
    arx2Markdown: arx2.markdownLinkLength,
    arx4Markdown: arx4.markdownLinkLength,
    vsArx2: Number((((arx2.markdownLinkLength - auto.markdownLinkLength) / arx2.markdownLinkLength) * 100).toFixed(2)),
    vsArx4: Number((((arx4.markdownLinkLength - auto.markdownLinkLength) / arx4.markdownLinkLength) * 100).toFixed(2)),
    discordOk: auto.markdownLinkLength <= DISCORD_MESSAGE_MAX_LENGTH,
    asciiMarkdown: isChatSafeAsciiFragment(autoFragment),
  };
}

describe("arx5 markdown-link fuzz", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson);
  });

  it(`encodes ${fuzzDrafts.length} varied drafts and compares markdown link length`, async () => {
    expect(fuzzDrafts.length).toBeGreaterThanOrEqual(40);
    expect(fuzzDrafts.length).toBeLessThanOrEqual(50);

    for (const draft of fuzzDrafts) {
      rows.push(await measureDraft(draft));
    }
  }, 120_000);

  it(`encodes ${fuzzBundles.length} mixed bundles the same way`, async () => {
    for (const envelope of fuzzBundles) {
      rows.push(await measureBundle(envelope));
    }
  });

  it("never detonates an auto markdown destination the way a percent-encoded arx4 paste URL does", async () => {
    const draft = fuzzDrafts.find((item) => item.title === "Bench excerpt");
    expect(draft).toBeDefined();
    if (!draft) return;

    const arx4 = await createGeneratedArtifactLinkAsync({ ...draft, codec: "arx4" }, BASE_URL);
    const auto = await createGeneratedArtifactLinkAsync({ ...draft, codec: "auto" }, BASE_URL);
    const detonatedPaste = percentEncodedPasteLength(arx4);

    expect(auto.markdownLinkLength).toBeLessThan(detonatedPaste);
    expect(arx4.markdownLinkLength).toBeLessThan(detonatedPaste);
  });
});

afterAll(() => {
  if (rows.length === 0) return;

  const beatsArx2 = rows.filter((row) => row.autoMarkdown < row.arx2Markdown).length;
  const tiesArx2 = rows.filter((row) => row.autoMarkdown === row.arx2Markdown).length;
  const losesArx2 = rows.filter((row) => row.autoMarkdown > row.arx2Markdown).length;
  const beatsArx4 = rows.filter((row) => row.autoMarkdown < row.arx4Markdown).length;
  const summary = {
    cases: rows.length,
    autoCodecs: Object.fromEntries(
      [...new Set(rows.map((row) => row.autoCodec))].map((codec) => [
        codec,
        rows.filter((row) => row.autoCodec === codec).length,
      ]),
    ),
    asciiMarkdown: rows.every((row) => row.asciiMarkdown),
    discordOk: rows.filter((row) => row.discordOk).length,
    vsArx2: { beats: beatsArx2, ties: tiesArx2, loses: losesArx2 },
    vsArx4: {
      beats: beatsArx4,
      ties: rows.length - beatsArx4,
      loses: rows.filter((row) => row.autoMarkdown > row.arx4Markdown).length,
    },
    medianVsArx2: rows.map((row) => row.vsArx2).sort((left, right) => left - right)[Math.floor(rows.length / 2)],
    rows,
  };

  const table = [
    "# arx5 markdown-link fuzz",
    "",
    `Cases: ${summary.cases}. Auto codecs: ${JSON.stringify(summary.autoCodecs)}.`,
    `ASCII markdown destinations: ${summary.asciiMarkdown}. Discord-sized: ${summary.discordOk}/${summary.cases}.`,
    `vs arx2 markdown length: ${beatsArx2} shorter, ${tiesArx2} tie, ${losesArx2} longer. Median gain ${summary.medianVsArx2}%.`,
    `vs arx4 markdown length: ${beatsArx4} shorter, ${summary.vsArx4.ties} tie, ${summary.vsArx4.loses} longer.`,
    "",
    "| Artifact | Kind | Auto | auto md | arx2 md | arx4 md | vs arx2 | vs arx4 | Discord |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${row.kind} | ${row.autoCodec} | ${row.autoMarkdown} | ${row.arx2Markdown} | ${row.arx4Markdown} | ${row.vsArx2}% | ${row.vsArx4}% | ${row.discordOk ? "ok" : "over"} |`,
    ),
    "",
  ].join("\n");

  const reportDirs = ["test-results"];
  if (process.env.CURSOR_ARTIFACTS_DIR) {
    reportDirs.push(process.env.CURSOR_ARTIFACTS_DIR);
  } else if (existsSync("/opt/cursor")) {
    reportDirs.push("/opt/cursor/artifacts");
  }

  for (const dir of reportDirs) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "arx5_markdown_link_fuzz.json"), `${JSON.stringify(summary, null, 2)}\n`);
      writeFileSync(path.join(dir, "arx5_markdown_link_fuzz.md"), table);
    } catch {
      // Diagnostic output must not fail the suite.
    }
  }
});
