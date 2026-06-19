import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const appDirectory = "src/app";
const generatedTypesDirectory = ".next/types";
const staticFiles = [
  [path.join(generatedTypesDirectory, "cache-life.d.ts"), "export {};\n"],
  [path.join(generatedTypesDirectory, "routes.d.ts"), "export {};\n"],
  [path.join(generatedTypesDirectory, "validator.ts"), "export {};\n"],
  [path.join(generatedTypesDirectory, "package.json"), '{"type":"module"}\n'],
];

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function* getAppEntries(directory = appDirectory) {
  const children = await readdir(directory, { withFileTypes: true });

  for (const child of children) {
    const childPath = path.join(directory, child.name);

    if (child.isDirectory()) {
      yield* getAppEntries(childPath);
      continue;
    }

    if (child.name === "layout.tsx" || child.name === "page.tsx") {
      yield childPath;
    }
  }
}

function getGeneratedAppTypePath(sourcePath) {
  const relativePath = path.relative(appDirectory, sourcePath).replace(/\.tsx$/, ".ts");
  return path.join(generatedTypesDirectory, "app", relativePath);
}

async function ensureFile(filePath, contents) {
  if (await fileExists(filePath)) {
    return false;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  return true;
}

let wroteStub = false;

for (const [filePath, contents] of staticFiles) {
  wroteStub = (await ensureFile(filePath, contents)) || wroteStub;
}

for await (const entry of getAppEntries()) {
  wroteStub = (await ensureFile(getGeneratedAppTypePath(entry), "export {};\n")) || wroteStub;
}

if (wroteStub) {
  await rm("tsconfig.tsbuildinfo", { force: true });
}
