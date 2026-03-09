import path from "node:path";
import { expect, test } from "@playwright/test";
import { goToHash, setTheme, stabilizePage, waitForRendererReady, waitForViewerState } from "./helpers";

const stylePath = path.join(__dirname, "screenshot.css");

async function captureArtifact(
  page: import("@playwright/test").Page,
  sampleTitle: string,
  kind: "markdown" | "code" | "diff" | "csv" | "json",
  name: string,
  theme: "light" | "dark" = "light",
) {
  await setTheme(page, theme);
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await page.getByRole("link", { name: new RegExp(sampleTitle, "i") }).click();
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, kind);
  await expect(page.locator(".artifact-first-layout")).toHaveScreenshot(name, { animations: "disabled", stylePath });
}

test("empty state visual regression", async ({ page }) => {
  await setTheme(page, "light");
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await expect(page.locator("main")).toHaveScreenshot("empty-state-light.png", { animations: "disabled", stylePath });
});

test("markdown visual regression in light mode", async ({ page }) => {
  await captureArtifact(page, "Maintainer kickoff", "markdown", "markdown-light.png");
});

test("markdown visual regression in dark mode", async ({ page }) => {
  await captureArtifact(page, "Maintainer kickoff", "markdown", "markdown-dark.png", "dark");
});

test("code visual regression", async ({ page }) => {
  await captureArtifact(page, "Viewer bootstrap", "code", "code-light.png");
});

test("diff visual regression", async ({ page }) => {
  await captureArtifact(page, "Phase 1 sample diff", "diff", "diff-light.png");
});

test("csv compact visual regression", async ({ page }) => {
  await captureArtifact(page, "Data export preview", "csv", "csv-compact-light.png");
});

test("json visual regression", async ({ page }) => {
  await setTheme(page, "light");
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await page.getByRole("link", { name: /Release bundle/i }).click();
  await waitForViewerState(page, "artifact");
  await page.getByRole("button", { name: /Open artifact Artifact manifest/i }).click();
  await waitForRendererReady(page, "json");
  await expect(page.locator(".artifact-first-layout")).toHaveScreenshot("json-light.png", { animations: "disabled", stylePath });
});

test("bundle switcher visual regression", async ({ page }) => {
  await setTheme(page, "light");
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await page.getByRole("link", { name: /Release bundle/i }).click();
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "json");
  await expect(page.locator(".artifact-selector-row")).toHaveScreenshot("bundle-switcher-light.png", { animations: "disabled", stylePath });
});
