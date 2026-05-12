import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const nextDir = join(process.cwd(), ".next");
const appBuildManifestPath = join(nextDir, "app-build-manifest.json");
const reactLoadableManifestPath = join(nextDir, "react-loadable-manifest.json");
const gzipSizeCache = new Map();

const budgets = [
  {
    maxBytes: 115 * 1024,
    name: "homepage route JS",
    route: "/page",
    type: "route",
  },
  {
    importKeyParts: ["components/viewer/artifact-stage", "code-renderer"],
    maxBytes: 100 * 1024,
    name: "code renderer deferred JS",
    type: "loadable",
  },
  {
    importKeyParts: ["components/viewer/artifact-stage", "markdown-renderer"],
    maxBytes: 52 * 1024,
    name: "markdown renderer deferred JS",
    type: "loadable",
  },
  {
    importKeyParts: ["components/renderers/diff-renderer", "@git-diff-view/react"],
    maxBytes: 340 * 1024,
    name: "rich diff library deferred JS",
    type: "loadable",
  },
];

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`${path} is missing. Run npm run build before checking build budgets.`);
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function gzipFileSize(path) {
  const cached = gzipSizeCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  const size = gzipSync(readFileSync(path)).length;
  gzipSizeCache.set(path, size);
  return size;
}

function getUniqueJsFiles(files) {
  const seen = new Set();
  const jsFiles = [];

  for (const file of files) {
    if (!file.endsWith(".js") || seen.has(file)) {
      continue;
    }

    seen.add(file);
    jsFiles.push(file);
  }

  return jsFiles;
}

function getRouteFiles(appBuildManifest, route) {
  const files = appBuildManifest.pages?.[route];

  if (!files) {
    throw new Error(`Route "${route}" was not found in app-build-manifest.json.`);
  }

  return getUniqueJsFiles(files);
}

function getLoadableFiles(reactLoadableManifest, keyParts) {
  const files = [];
  let hasMatch = false;

  for (const key in reactLoadableManifest) {
    let isMatch = true;
    for (const part of keyParts) {
      if (!key.includes(part)) {
        isMatch = false;
        break;
      }
    }

    if (!isMatch) {
      continue;
    }

    hasMatch = true;
    const value = reactLoadableManifest[key];
    for (const file of value.files ?? []) {
      files.push(file);
    }
  }

  if (!hasMatch) {
    throw new Error(`No react-loadable entry matched: ${keyParts.join(" + ")}`);
  }

  return getUniqueJsFiles(files);
}

function getBudgetFiles(budget, manifests) {
  if (budget.type === "route") {
    return getRouteFiles(manifests.appBuildManifest, budget.route);
  }

  return getLoadableFiles(manifests.reactLoadableManifest, budget.importKeyParts);
}

function measureBudget(budget, manifests) {
  const files = getBudgetFiles(budget, manifests);
  let gzipBytes = 0;

  for (const file of files) {
    gzipBytes += gzipFileSize(join(nextDir, file));
  }

  return {
    ...budget,
    files,
    gzipBytes,
  };
}

const manifests = {
  appBuildManifest: readJson(appBuildManifestPath),
  reactLoadableManifest: readJson(reactLoadableManifestPath),
};

const results = [];
const failures = [];

for (const budget of budgets) {
  const result = measureBudget(budget, manifests);
  results.push(result);

  if (result.gzipBytes > result.maxBytes) {
    failures.push(result);
  }
}

for (const result of results) {
  const status = result.gzipBytes > result.maxBytes ? "FAIL" : "ok";
  console.log(
    `${status} ${result.name}: ${formatBytes(result.gzipBytes)} / ${formatBytes(result.maxBytes)}`,
  );
}

if (failures.length > 0) {
  console.error("\nBuild budget exceeded:");
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${formatBytes(failure.gzipBytes)} > ${formatBytes(failure.maxBytes)}`);
    for (const file of failure.files) {
      console.error(`  ${file}`);
    }
  }
  process.exit(1);
}

console.log("\nBuild budget check passed.");
