import type { Page } from "@playwright/test";

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
  await page.locator(`[data-testid="viewer-shell"][data-viewer-state="${state}"]`).waitFor();
}
