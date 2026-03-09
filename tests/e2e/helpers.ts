import { expect, type Page } from "@playwright/test";

export async function goToHash(page: Page, hash = "") {
  await page.goto(`.${hash}`);
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("theme", value);
  }, theme);
}

export async function stabilizePage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
}

export async function waitForViewerState(page: Page, state: string) {
  await expect(page.locator('[data-testid="viewer-shell"]')).toHaveAttribute("data-viewer-state", state);
}

export async function waitForRendererReady(page: Page, kind: "markdown" | "code" | "diff" | "csv" | "json") {
  await expect(page.locator(`[data-testid="viewer-shell"][data-viewer-state="artifact"][data-active-kind="${kind}"][data-renderer-ready="true"]`)).toBeVisible();

  const readinessSelectorByKind: Record<typeof kind, string> = {
    markdown: "[data-testid='renderer-markdown'][data-renderer-ready='true'] .markdown-article",
    code: "[data-testid='renderer-code'][data-renderer-ready='true'] .cm-editor",
    diff: "[data-testid='renderer-diff'][data-renderer-ready='true'] .patch-file-section",
    csv: "[data-testid='renderer-csv'][data-renderer-ready='true'] table.csv-table tbody tr",
    json: "[data-testid='renderer-json'][data-renderer-ready='true'] .json-tree-shell",
  };

  await expect(page.locator(readinessSelectorByKind[kind]).first()).toBeVisible();

  await page.waitForLoadState("load");
  await page.waitForFunction(async () => {
    if (!document.fonts) {
      return true;
    }

    await document.fonts.ready;
    return document.fonts.status === "loaded";
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
}
