import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const nextDir = join(process.cwd(), ".next");
const appBuildManifestPath = join(nextDir, "app-build-manifest.json");
const reactLoadableManifestPath = join(nextDir, "react-loadable-manifest.json");
const gzipSizeCache = new Map();

// Build budget policy (owned, deliberate). Each ceiling is a gzipped-size limit
// chosen to keep the initial homepage payload small and to ensure heavy
// renderers stay code-split behind dynamic imports rather than leaking into the
// first load. These numbers are a contract, not a measurement: when a budget
// trips, the policy is to investigate the regression first (a stray top-level
// import, an un-split dependency, a bloated transitive dep) and only raise the
// number as a deliberate, justified decision — never reflexively to make the
// check pass.
export const budgets = [
  {
    // Guards the homepage's first-load JS (everything shipped for "/page").
    // 115 KiB gzipped is the agreed ceiling for an interactive-but-lean entry
    // payload. If this trips, something that should be deferred has been pulled
    // into the initial bundle — fix the import, don't bump the ceiling.
    maxBytes: 115 * 1024,
    name: "homepage route JS",
    route: "/page",
    type: "route",
  },
  {
    // Guards the code renderer, which must load lazily from the artifact stage.
    // The renderer now mounts Pierre's `File`, so this entrypoint carries the
    // shared @pierre/diffs + Shiki core chunks it overlaps with the diff viewer;
    // the previous CodeMirror stack is gone. 170 KiB reflects that consolidated
    // highlighting stack. Growth usually means a new grammar or theme crept in.
    importKeyParts: ["components/viewer/artifact-stage", "code-renderer"],
    maxBytes: 170 * 1024,
    name: "code renderer deferred JS",
    type: "loadable",
  },
  {
    // Guards the deferred markdown renderer. 52 KiB gzipped reflects the
    // markdown + sanitizer stack; growth typically comes from added remark/rehype
    // plugins. Audit the plugin chain before raising.
    importKeyParts: ["components/viewer/artifact-stage", "markdown-renderer"],
    maxBytes: 52 * 1024,
    name: "markdown renderer deferred JS",
    type: "loadable",
  },
  {
    // Guards the deferred @pierre/diffs stack. The review renderer stays outside
    // the initial shell and loads only for diff artifacts; its count includes the
    // shared Pierre core also counted under the code renderer's entrypoint.
    // A jump here means a version bump grew that isolated review surface.
    importKeyParts: ["components/viewer/artifact-stage", "diff-renderer"],
    maxBytes: 165 * 1024,
    name: "rich diff library deferred JS",
    type: "loadable",
  },
  {
    // Guards the @pierre/trees file navigator. It sits behind its own dynamic
    // boundary inside the diff renderer and the artifact editor, so single-file
    // diffs and non-diff edits never pay for it. Both importers share one chunk.
    importKeyParts: ["file-tree-nav"],
    maxBytes: 80 * 1024,
    name: "patch file tree deferred JS",
    type: "loadable",
  },
  {
    // Guards the editable document surface: Pierre's CodeView plus the Editor
    // runtime from @pierre/diffs/edit. It loads only while the artifact editor
    // is open and shares its core with the diff viewer's chunk.
    importKeyParts: ["artifact-editor", "artifact-body-editor"],
    maxBytes: 240 * 1024,
    name: "artifact body editor deferred JS",
    type: "loadable",
  },
];

/**
 * Pure size-vs-budget decision, extracted so the enforcement semantics can be
 * unit-tested without a real Next build. A budget passes when its measured
 * gzipped size is at or below maxBytes, and fails as soon as it exceeds it.
 */
export function evaluateBudget(budget, actualBytes) {
  return {
    name: budget.name,
    maxBytes: budget.maxBytes,
    actualBytes,
    ok: actualBytes <= budget.maxBytes,
  };
}

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
    const normalizedKey = key.replaceAll("\\", "/");
    let isMatch = true;
    for (const part of keyParts) {
      if (!normalizedKey.includes(part)) {
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

function main() {
  const manifests = {
    appBuildManifest: readJson(appBuildManifestPath),
    reactLoadableManifest: readJson(reactLoadableManifestPath),
  };

  const results = [];
  const failures = [];

  for (const budget of budgets) {
    const measured = measureBudget(budget, manifests);
    const decision = evaluateBudget(budget, measured.gzipBytes);
    const result = { ...measured, ok: decision.ok };
    results.push(result);

    if (!result.ok) {
      failures.push(result);
    }
  }

  for (const result of results) {
    const status = result.ok ? "ok" : "FAIL";
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
}

// Only run the build-dependent check when invoked directly (npm run check); the
// budgets table and evaluateBudget stay importable for tests without a build.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
