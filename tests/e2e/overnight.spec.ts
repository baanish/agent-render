import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import {
  goToHash,
  setTheme,
  stabilizePage,
  waitForRendererReady,
  waitForViewerState,
} from "./helpers";

// Overnight spot-check spec: captures full-page screenshots of every artifact
// kind across light/dark themes and a mobile viewport. Gated by RUN_OVERNIGHT
// so routine `npm run test:e2e` runs stay bounded to behavioral + visual.
// Output lands in `.impeccable/overnight-shots/` for morning review.

const SHOT_DIR = path.resolve(__dirname, "../../.impeccable/overnight-shots");
const RUN = process.env.RUN_OVERNIGHT === "1";

test.skip(!RUN, "Overnight spot-check spec only runs when RUN_OVERNIGHT=1");

type Kind = "markdown" | "code" | "diff" | "csv" | "json";

type SpotCheck = {
  sampleTitle: RegExp;
  kind: Kind;
  selector: string;
  slug: string;
};

const SPOT_CHECKS: SpotCheck[] = [
  {
    sampleTitle: /maintainer kickoff/i,
    kind: "markdown",
    selector: "main",
    slug: "markdown",
  },
  {
    sampleTitle: /viewer bootstrap/i,
    kind: "code",
    selector: "main",
    slug: "code",
  },
  {
    sampleTitle: /phase 1 sample diff/i,
    kind: "diff",
    selector: "main",
    slug: "diff",
  },
  {
    sampleTitle: /data export preview/i,
    kind: "csv",
    selector: "main",
    slug: "csv",
  },
];

async function captureSpotCheck(
  page: import("@playwright/test").Page,
  check: SpotCheck,
  theme: "light" | "dark",
  viewport: { width: number; height: number },
  viewportSlug: string,
) {
  await page.setViewportSize(viewport);
  await setTheme(page, theme);
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await page.getByRole("link", { name: check.sampleTitle }).click();
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, check.kind);
  await page.waitForTimeout(350);

  const fileName = `${check.slug}-${theme}-${viewportSlug}.png`;
  await page.screenshot({
    fullPage: true,
    path: path.join(SHOT_DIR, fileName),
  });
}

test.beforeAll(async () => {
  await fs.mkdir(SHOT_DIR, { recursive: true });
});

test("empty state light+dark", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await goToHash(page);
    await stabilizePage(page);
    await waitForViewerState(page, "empty");
    await page.screenshot({
      fullPage: true,
      path: path.join(SHOT_DIR, `empty-${theme}-desktop.png`),
    });
  }
});

for (const check of SPOT_CHECKS) {
  test(`spot-check ${check.slug} desktop`, async ({ page }) => {
    await captureSpotCheck(page, check, "light", { width: 1440, height: 900 }, "desktop");
    await captureSpotCheck(page, check, "dark", { width: 1440, height: 900 }, "desktop");
  });

  test(`spot-check ${check.slug} mobile`, async ({ page }) => {
    await captureSpotCheck(page, check, "light", { width: 390, height: 844 }, "mobile");
  });
}

test("json bundle (arx showcase) desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await goToHash(page);
    await stabilizePage(page);
    await waitForViewerState(page, "empty");
    await page.getByRole("link", { name: /arx showcase/i }).click();
    await waitForViewerState(page, "artifact");
    await page
      .getByRole("button", { name: /Open artifact Artifact manifest/i })
      .click();
    await waitForRendererReady(page, "json");
    await page.screenshot({
      fullPage: true,
      path: path.join(SHOT_DIR, `json-${theme}-desktop.png`),
    });
  }
});

test("errored fragment promoted to top", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setTheme(page, "light");
  // Force a fragment that will fail decode (#e without a valid arx4 payload
  // will surface a decode error in the URL inspector).
  await goToHash(page, "#e1|bad-payload-that-cannot-decode");
  await stabilizePage(page);
  await waitForViewerState(page, "error");
  await page.screenshot({
    fullPage: true,
    path: path.join(SHOT_DIR, "errored-fragment-promoted.png"),
  });
});

test("empty state mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, "light");
  await goToHash(page);
  await stabilizePage(page);
  await waitForViewerState(page, "empty");
  await page.screenshot({
    fullPage: true,
    path: path.join(SHOT_DIR, "empty-light-mobile.png"),
  });
});
