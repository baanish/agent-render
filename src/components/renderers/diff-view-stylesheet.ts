import { withBasePath } from "@/lib/site/base-path";

// Ref-counted loader for the @git-diff-view vendor stylesheet. The diff renderer is the only consumer
// and mounts at most a few instances, so a module-level refcount keeps the heavy stylesheet injected
// exactly while a rich diff is on screen and removes it once the last instance unmounts.

const DIFF_VIEW_STYLESHEET_ID = "agent-render-diff-view-styles";
const diffViewStylesheetHrefs = [
  withBasePath("/vendor/diff-view-pure.css.br"),
  withBasePath("/vendor/diff-view-pure.css"),
];

let diffViewStylesheetPromise: Promise<void> | null = null;
let diffViewStylesheetRefCount = 0;

function loadStylesheetHref(href: string) {
  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");

    const cleanup = () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      link.dataset.loaded = "true";
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      link.remove();
      reject(new Error(`Diff view stylesheet failed to load: ${href}`));
    };

    link.id = DIFF_VIEW_STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = href;
    link.addEventListener("load", handleLoad);
    link.addEventListener("error", handleError);
    document.head.appendChild(link);
  });
}

/** Inject the diff-view stylesheet (preferring the precompressed variant), de-duplicating in flight. */
export function loadDiffViewStylesheet() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const existingLink = document.getElementById(DIFF_VIEW_STYLESHEET_ID) as HTMLLinkElement | null;

  if (existingLink?.dataset.loaded === "true" || existingLink?.sheet) {
    if (existingLink) {
      existingLink.dataset.loaded = "true";
    }
    return Promise.resolve();
  }

  if (diffViewStylesheetPromise && !existingLink) {
    diffViewStylesheetPromise = null;
  }

  if (diffViewStylesheetPromise) {
    return diffViewStylesheetPromise;
  }

  existingLink?.remove();

  diffViewStylesheetPromise = (async () => {
    let lastError: unknown;

    for (const href of diffViewStylesheetHrefs) {
      try {
        await loadStylesheetHref(href);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Diff view stylesheet failed to load.");
  })().catch((error) => {
    diffViewStylesheetPromise = null;
    throw error;
  });

  return diffViewStylesheetPromise;
}

/** Mark one diff instance as using the stylesheet. */
export function retainDiffViewStylesheet() {
  diffViewStylesheetRefCount += 1;
}

/** Release one diff instance; removes the stylesheet once the last consumer unmounts. */
export function releaseDiffViewStylesheet() {
  diffViewStylesheetRefCount = Math.max(0, diffViewStylesheetRefCount - 1);
  if (diffViewStylesheetRefCount > 0) {
    return;
  }

  document.getElementById(DIFF_VIEW_STYLESHEET_ID)?.remove();
  diffViewStylesheetPromise = null;
}
