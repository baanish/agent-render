import { expect, test } from "@playwright/test";
import { getFragmentHash, invalidFragments } from "../fixtures/payloads";
import { goToHash, stabilizePage, waitForViewerState } from "./helpers";

declare global {
  interface Window {
    __printCalled?: boolean;
  }
}

test.beforeEach(async ({ page }) => {
  await goToHash(page);
  await stabilizePage(page);
});

test("renders the empty state", async ({ page }) => {
  await waitForViewerState(page, "empty");
  await expect(page.getByText("Share artifacts in the URL, keep the server out of the payload.")).toBeVisible();
});

test("renders markdown payloads and triggers print", async ({ page }) => {
  await goToHash(page, getFragmentHash("Maintainer kickoff"));
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='markdown']")).toBeVisible();
  await expect(page.getByText("Sprint roadmap").first()).toBeVisible();

  await page.evaluate(() => {
    window.__printCalled = false;
    window.print = () => {
      window.__printCalled = true;
    };
  });

  await page.getByRole("button", { name: "Print / PDF" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__printCalled))).toBe(true);
});

test("renders code payloads", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.locator(".cm-editor").first()).toBeVisible();
});

test("renders multi-file diffs without mutating the payload hash", async ({ page }) => {
  await goToHash(page, getFragmentHash("Phase 1 sample diff"));
  await waitForViewerState(page, "artifact");
  const beforeHash = await page.evaluate(() => window.location.hash);
  await expect(page.locator(".patch-file-section")).toHaveCount(2);
  await page.locator("button.patch-bundle-link").nth(1).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(beforeHash);
});

test("renders compact CSV payloads without giant whitespace", async ({ page }) => {
  await goToHash(page, getFragmentHash("Data export preview"));
  await waitForViewerState(page, "artifact");
  const frame = await page.locator(".viewer-frame-hero").boundingBox();
  expect(frame?.height ?? 0).toBeLessThan(900);
  await expect(page.locator("table.csv-table")).toBeVisible();
});

test("renders JSON tree and raw views", async ({ page }) => {
  await goToHash(page, getFragmentHash("Release bundle"));
  await waitForViewerState(page, "artifact");
  await page.getByRole("button", { name: /Open artifact Artifact manifest/i }).click();
  await expect(page.locator("[data-active-kind='json']")).toBeVisible();
  await expect(page.locator(".json-tree-shell")).toBeVisible();
  await page.getByRole("button", { name: "Raw" }).click();
  await expect(page.locator(".json-renderer-shell .cm-editor")).toBeVisible();
});

test("switches artifacts within a bundle", async ({ page }) => {
  await goToHash(page, getFragmentHash("Release bundle"));
  await waitForViewerState(page, "artifact");
  const beforeHash = await page.evaluate(() => window.location.hash);
  await page.getByRole("button", { name: /Open artifact Bundle metrics/i }).click();
  await expect(page.locator("[data-active-artifact-id='metrics']")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(beforeHash);
});

test("theme switching works", async ({ page }) => {
  await waitForViewerState(page, "empty");
  await page.getByRole("button", { name: /Switch to dark theme/i }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("download action emits a file", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download" }).click(),
  ]);
  await expect(download.suggestedFilename()).toContain("viewer-shell.tsx");
});

test("invalid payloads fail gracefully", async ({ page }) => {
  const decodeErrorMessage = "The fragment payload could not be decoded as valid JSON.";
  await goToHash(page, invalidFragments.malformed);
  await waitForViewerState(page, "error");
  await expect(page.locator('[data-testid="viewer-shell"]')).toContainText(decodeErrorMessage);
});
