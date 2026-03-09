import path from "node:path";
import { expect, test } from "@playwright/test";
import { getFragmentHash } from "../fixtures/payloads";
import { goToHash, setTheme, stabilizePage, waitForRendererReady, waitForViewerState } from "./helpers";

const stylePath = path.join(__dirname, "screenshot.css");

async function captureArtifact(
  page: import("@playwright/test").Page,
  hash: string,
  kind: "markdown" | "code" | "diff" | "csv" | "json",
  name: string,
  theme: "light" | "dark" = "light",
) {
  await setTheme(page, theme);
  await goToHash(page, hash);
  await stabilizePage(page);
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
  await captureArtifact(page, getFragmentHash("Maintainer kickoff"), "markdown", "markdown-light.png");
});

test("markdown visual regression in dark mode", async ({ page }) => {
  await captureArtifact(page, getFragmentHash("Maintainer kickoff"), "markdown", "markdown-dark.png", "dark");
});

test("code visual regression", async ({ page }) => {
  await captureArtifact(page, getFragmentHash("Viewer bootstrap"), "code", "code-light.png");
});

test("diff visual regression", async ({ page }) => {
  await captureArtifact(page, getFragmentHash("Phase 1 sample diff"), "diff", "diff-light.png");
});

test("csv compact visual regression", async ({ page }) => {
  await captureArtifact(page, getFragmentHash("Data export preview"), "csv", "csv-compact-light.png");
});

test("json visual regression", async ({ page }) => {
  await captureArtifact(page, getFragmentHash("Release bundle"), "json", "json-light.png");
});

test("bundle switcher visual regression", async ({ page }) => {
  await setTheme(page, "light");
  await goToHash(page, getFragmentHash("Release bundle"));
  await stabilizePage(page);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "json");
  await expect(page.locator(".artifact-selector-row")).toHaveScreenshot("bundle-switcher-light.png", { animations: "disabled", stylePath });
});
