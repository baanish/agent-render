import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKILLS_ROOT = path.join(ROOT, "skills");
const PUBLIC_SKILLS = path.join(ROOT, "public", "skills");

async function main() {
  await rm(PUBLIC_SKILLS, { recursive: true, force: true });
  await mkdir(PUBLIC_SKILLS, { recursive: true });

  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillMd = path.join(SKILLS_ROOT, entry.name, "SKILL.md");
    try {
      await readFile(skillMd);
    } catch {
      continue;
    }

    const destDir = path.join(PUBLIC_SKILLS, entry.name);
    await mkdir(destDir, { recursive: true });
    await cp(skillMd, path.join(destDir, "SKILL.md"));
  }
}

await main();
