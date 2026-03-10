import { expect, test } from "@playwright/test";
import { getFragmentHash, invalidFragments } from "../fixtures/payloads";
import { goToHash, stabilizePage, waitForRendererReady, waitForViewerState } from "./helpers";

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

test.describe("mobile UX", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("defaults narrow diff views to unified and gates split mode", async ({ page }) => {
    await goToHash(page, getFragmentHash("Phase 1 sample diff"));
    await waitForViewerState(page, "artifact");
    await waitForRendererReady(page, "diff");

    const diffRenderer = page.getByTestId("renderer-diff");
    const patchNav = page.locator(".patch-bundle-nav");
    await expect(diffRenderer).toHaveAttribute("data-mobile-layout", "true");
    await expect(diffRenderer).toHaveAttribute("data-diff-mode", "unified");
    await expect(page.getByRole("button", { name: "Open split columns" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Split$/ })).toHaveCount(0);
    await expect.poll(() => patchNav.evaluate((element) => window.getComputedStyle(element).flexDirection)).toBe("row");

    await page.getByRole("button", { name: "Open split columns" }).click();
    await expect(diffRenderer).toHaveAttribute("data-diff-mode", "split");
    await expect(page.getByRole("button", { name: "Back to unified" })).toBeVisible();
  });

  test("surfaces the try-it action before supporting links on phones", async ({ page }) => {
    await waitForViewerState(page, "empty");

    const tryItBox = await page.locator(".home-hero-callouts .hero-link-card.is-static").boundingBox();
    const sourceBox = await page.getByRole("link", { name: /Browse the GitHub repo/i }).boundingBox();
    const samplesBox = await page.locator(".home-samples-panel").boundingBox();
    const inspectorBox = await page.locator(".home-inspector-panel").boundingBox();

    expect(tryItBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(sourceBox?.y ?? 0);
    expect(samplesBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(inspectorBox?.y ?? 0);
    await expect(page.getByRole("link", { name: /Maintainer kickoff/i })).toBeVisible();
  });

  test("keeps homepage and artifact metadata in compact two-column grids", async ({ page }) => {
    await waitForViewerState(page, "empty");

    const homeMetrics = page.locator(".home-inspector-panel .metric-grid");
    await expect.poll(() => homeMetrics.evaluate((element) => window.getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);

    await goToHash(page, getFragmentHash("Release bundle"));
    await waitForViewerState(page, "artifact");

    const artifactMetrics = page.getByTestId("artifact-metadata-grid");
    await expect.poll(() => artifactMetrics.evaluate((element) => window.getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  });
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
