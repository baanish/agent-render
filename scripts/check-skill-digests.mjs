#!/usr/bin/env node
/**
 * Keeps `public/.well-known/agent-skills/index.json` honest.
 *
 * The discovery index publishes a sha256 digest and description for each SKILL.md. A client that
 * verifies the digest rejects the skill outright when it drifts, so editing a skill without
 * regenerating the index silently breaks discovery for everyone who checks. Nothing else in the
 * build reads these files together, which is why this check exists.
 *
 * Run with --write to regenerate instead of failing.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INDEX_PATH = fileURLToPath(new URL("../public/.well-known/agent-skills/index.json", import.meta.url));
const SKILL_PATHS = {
  "agent-render-linking": fileURLToPath(new URL("../skills/agent-render-linking/SKILL.md", import.meta.url)),
  "selfhosted-agent-render": fileURLToPath(new URL("../skills/selfhosted-agent-render/SKILL.md", import.meta.url)),
};

/** Reads one YAML frontmatter field so the index cannot drift from the skill's own header. */
function frontmatterField(source, field) {
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!match) return null;
  const value = new RegExp(`^${field}:[ \\t]*(.*)$`, "m").exec(match[1]);
  return value ? value[1].trim() : null;
}

const write = process.argv.includes("--write");
const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const problems = [];

// Problems a rewrite cannot resolve: regenerating the file leaves these entries just as broken, so
// --write must not report success for them.
const unfixable = [];

for (const skill of index.skills ?? []) {
  const skillPath = SKILL_PATHS[skill.name];
  if (!skillPath) {
    const problem = `${skill.name}: no local SKILL.md is mapped in scripts/check-skill-digests.mjs`;
    problems.push(problem);
    unfixable.push(problem);
    continue;
  }

  const source = readFileSync(skillPath, "utf8");
  const digest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
  const description = frontmatterField(source, "description");
  const declaredName = frontmatterField(source, "name");

  // A renamed skill is not something regenerating the digest can fix: the index entry, this
  // script's path mapping, and the published URL all key on the old name and must be changed
  // together, deliberately.
  if (declaredName !== null && declaredName !== skill.name) {
    const problem = `${skill.name}: SKILL.md declares name "${declaredName}"; update the index entry, URL, and mapping together`;
    problems.push(problem);
    unfixable.push(problem);
  }

  if (skill.digest !== digest) {
    problems.push(`${skill.name}: digest is ${skill.digest}, file hashes to ${digest}`);
    skill.digest = digest;
  }

  if (description && skill.description !== description) {
    problems.push(`${skill.name}: description does not match the skill frontmatter`);
    skill.description = description;
  }
}

if (problems.length === 0) {
  console.log("Skill discovery index matches the published skills.");
  process.exit(0);
}

if (write) {
  writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Updated skill discovery index:\n  ${problems.join("\n  ")}`);
  if (unfixable.length > 0) {
    console.error(`\nStill broken after regenerating:\n  ${unfixable.join("\n  ")}`);
    process.exit(1);
  }
  process.exit(0);
}

console.error(`Skill discovery index is stale:\n  ${problems.join("\n  ")}`);
console.error("\nRun `node scripts/check-skill-digests.mjs --write` to regenerate.");
process.exit(1);
