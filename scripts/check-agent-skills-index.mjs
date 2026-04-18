import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH = path.join(ROOT, "public", ".well-known", "agent-skills", "index.json");

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function parseDigest(value) {
  if (typeof value !== "string" || !value.startsWith("sha256:")) {
    return null;
  }
  const hex = value.slice("sha256:".length);
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return null;
  }
  return hex;
}

async function main() {
  const raw = await readFile(INDEX_PATH, "utf8");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (error) {
    console.error("Agent skills index is not valid JSON:", error);
    process.exit(1);
  }

  const schema =
    "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
  if (doc.$schema !== schema) {
    console.error(`Expected $schema "${schema}", got ${JSON.stringify(doc.$schema)}`);
    process.exit(1);
  }

  if (!Array.isArray(doc.skills)) {
    console.error('Expected a "skills" array in the discovery index.');
    process.exit(1);
  }

  const issues = [];

  for (const entry of doc.skills) {
    const name = entry?.name;
    if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      issues.push(`Invalid or missing skill name: ${JSON.stringify(name)}`);
      continue;
    }

    const skillPath = path.join(ROOT, "skills", name, "SKILL.md");
    const publicSkillPath = path.join(ROOT, "public", "skills", name, "SKILL.md");
    let expectedHex;
    try {
      expectedHex = await sha256File(skillPath);
    } catch {
      issues.push(`Missing source skill file for "${name}" at skills/${name}/SKILL.md`);
      continue;
    }

    try {
      const [a, b] = await Promise.all([readFile(skillPath), readFile(publicSkillPath)]);
      if (!a.equals(b)) {
        issues.push(
          `public/skills/${name}/SKILL.md is out of sync with skills/${name}/SKILL.md (run: npm run sync:agent-skills-public)`,
        );
      }
    } catch {
      issues.push(
        `Missing public/skills/${name}/SKILL.md — run: npm run sync:agent-skills-public`,
      );
    }

    const digest = entry.digest;
    if (!parseDigest(digest)) {
      issues.push(
        `Invalid digest for "${name}" (use sha256:<64 hex chars>): ${JSON.stringify(digest)}`,
      );
    }

    const expectedDigest = `sha256:${expectedHex}`;
    if (digest !== expectedDigest) {
      issues.push(
        `Digest mismatch for "${name}": index has ${JSON.stringify(digest)}, expected ${expectedDigest}`,
      );
    }

    const allowedTypes = new Set(["skill-md", "archive"]);
    if (!allowedTypes.has(entry.type)) {
      issues.push(`Invalid type for "${name}": ${JSON.stringify(entry.type)}`);
    }

    const url = entry.url;
    if (
      typeof url !== "string" ||
      !url.startsWith("https://agent-render.com/skills/") ||
      !url.endsWith("/SKILL.md")
    ) {
      issues.push(`Unexpected url for "${name}": ${JSON.stringify(url)}`);
    }
  }

  if (issues.length > 0) {
    console.error("Agent skills discovery index check failed:\n");
    for (const line of issues) {
      console.error(`- ${line}`);
    }
    process.exit(1);
  }

  console.log("Agent skills discovery index check passed.");
}

await main();
