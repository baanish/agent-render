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

test("renders the zero-retention homepage when no fragment is present", async ({ page }) => {
  await waitForViewerState(page, "empty");
  await expect(page.getByRole("heading", { name: /zero-retention artifact viewer/i })).toBeVisible();
  await expect(page.getByText(/artifact content lives in the URL fragment/i)).toBeVisible();
  await expect(page.getByText(/the static host does not receive artifact content/i)).toBeVisible();
  await expect(page.getByText(/browser history, screenshots, copied messages, extensions/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /github/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /payload format docs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /security page/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /openclaw/i })).toBeVisible();
});

test("creates, copies, and previews a generated homepage link", async ({ page }) => {
  await waitForViewerState(page, "empty");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          window.localStorage.setItem("copied-link", value);
          return Promise.resolve();
        },
      },
    });
  });

  await page.getByRole("button", { name: "code" }).click();
  await page.getByLabel("Title").fill("Homepage snippet");
  await page.getByLabel("Filename").fill("snippet.ts");
  await page.getByRole("textbox", { name: "Language", exact: true }).fill("ts");
  await page.getByRole("textbox", { name: /^Content\b/ }).fill("export const value = 42;\n");
  await page.getByRole("button", { name: "Generate link" }).click();

  const generatedLink = page.getByLabel("Generated agent-render link");
  await expect(generatedLink).toHaveValue(/#agent-render=/);
  await expect(page.getByText(/chars$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("copied-link"))).toContain("#agent-render=");

  await page.getByRole("button", { name: "Preview here" }).click();
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.getByText("Homepage snippet").first()).toBeVisible();
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

  await page.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__printCalled))).toBe(true);
});

test("renders code payloads", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.locator(".cm-editor").first()).toBeVisible();
});

test("renders arx2 fragments through the viewer", async ({ page }) => {
  const hash = "#agent-render=v1.arx2.1.B.G5YAoIzUVnkjvNDRuYkN71ZNo8KBFL0uoqsrTCc3P6gd25KyFmaWWi2GPGVBSQbV9vIA_tfs6WTMRdo0IIKRQEIMsoI36RDB7jr8YJq3abcYIzEpGs1Ady3VxyHdC-IyHyBG9yZRLJ0t5ClN5wftjQU";

  await goToHash(page, hash);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "code");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.getByText("viewer-shell.tsx").first()).toBeVisible();
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

  test("surfaces samples before inspector on phones", async ({ page }) => {
    await waitForViewerState(page, "empty");

    const samplesBox = await page.locator(".home-samples-section").boundingBox();
    const inspectorBox = await page.locator(".home-inspector-section").boundingBox();

    expect(samplesBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(inspectorBox?.y ?? 0);
    await expect(page.getByRole("link", { name: /Maintainer kickoff/i })).toBeVisible();
  });

  test("keeps artifact metadata in compact two-column grids", async ({ page }) => {
    await goToHash(page, getFragmentHash("arx showcase"));
    await waitForViewerState(page, "artifact");

    const artifactMetrics = page.getByTestId("artifact-metadata-grid");
    await expect.poll(() => artifactMetrics.evaluate((element) => window.getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  });

  test("code artifact defaults line wrap on for narrow viewports", async ({ page }) => {
    test.setTimeout(60_000);
    await goToHash(page, getFragmentHash("Viewer bootstrap"));
    await waitForViewerState(page, "artifact", { timeout: 45_000 });
    await waitForRendererReady(page, "code");

    await expect(page.getByRole("button", { name: /disable wrap/i })).toBeVisible();
  });

  test("markdown artifact toolbar keeps raw/rendered controls readable", async ({ page }) => {
    await goToHash(page, getFragmentHash("Maintainer kickoff"));
    await waitForViewerState(page, "artifact");
    await waitForRendererReady(page, "markdown");

    const toolbar = page.locator(".viewer-toolbar");
    const rendered = page.getByRole("button", { name: /^Rendered$/ });
    const raw = page.getByRole("button", { name: /^Raw$/ });

    await expect(rendered).toBeVisible();
    await expect(raw).toBeVisible();

    const toolbarBox = await toolbar.boundingBox();
    const renderedBox = await rendered.boundingBox();
    const rawBox = await raw.boundingBox();
    expect(toolbarBox && renderedBox && rawBox).toBeTruthy();
    if (toolbarBox && renderedBox && rawBox) {
      expect(renderedBox.width).toBeGreaterThan(48);
      expect(rawBox.width).toBeGreaterThan(48);
      expect(renderedBox.width + rawBox.width).toBeLessThanOrEqual(toolbarBox.width + 8);
    }
  });
});

test.describe("very narrow mobile toolbar", () => {
  test.use({ viewport: { width: 340, height: 720 } });

  test("stacks markdown raw/rendered toggle vertically at 340px", async ({ page }) => {
    await goToHash(page, getFragmentHash("Maintainer kickoff"));
    await waitForViewerState(page, "artifact");
    await waitForRendererReady(page, "markdown");

    const rendered = page.getByRole("button", { name: /^Rendered$/ });
    const raw = page.getByRole("button", { name: /^Raw$/ });
    await expect(rendered).toBeVisible();
    await expect(raw).toBeVisible();

    const renderedBox = await rendered.boundingBox();
    const rawBox = await raw.boundingBox();
    expect(renderedBox && rawBox).toBeTruthy();
    if (renderedBox && rawBox) {
      expect(rawBox.y).toBeGreaterThanOrEqual(renderedBox.y + renderedBox.height - 4);
    }
  });
});

test("renders compact CSV payloads without giant whitespace", async ({ page }) => {
  await goToHash(page, getFragmentHash("Data export preview"));
  await waitForViewerState(page, "artifact");
  const frame = await page.locator(".viewer-frame-primary").boundingBox();
  expect(frame?.height ?? 0).toBeLessThan(900);
  await expect(page.locator("table.csv-table")).toBeVisible();
});

test("renders JSON tree and raw views", async ({ page }) => {
  await goToHash(page, getFragmentHash("arx showcase"));
  await waitForViewerState(page, "artifact");
  await page.getByRole("button", { name: /Open artifact Artifact manifest/i }).click();
  await expect(page.locator("[data-active-kind='json']")).toBeVisible();
  await expect(page.locator(".json-tree-shell")).toBeVisible();
  await page.getByRole("button", { name: "Raw" }).click();
  await expect(page.locator(".json-renderer-shell .cm-editor")).toBeVisible();
});

test("switches artifacts within a bundle", async ({ page }) => {
  await goToHash(page, getFragmentHash("arx showcase"));
  await waitForViewerState(page, "artifact");
  const beforeHash = await page.evaluate(() => window.location.hash);
  await page.getByRole("button", { name: /Open artifact Bundle metrics/i }).click();
  await expect(page.locator("[data-active-artifact-id='metrics']")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(beforeHash);
});

test("header icon and name navigate to homepage", async ({ page }) => {
  await goToHash(page, getFragmentHash("arx showcase"));
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='json']")).toBeVisible();

  await page.getByRole("link", { name: "Go to homepage" }).click();
  await waitForViewerState(page, "empty");
  await expect(page.getByRole("heading", { name: /zero-retention artifact viewer/i })).toBeVisible();
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
    page.getByRole("button", { name: "Download" }).first().click(),
  ]);
  await expect(download.suggestedFilename()).toContain("viewer-shell.tsx");
});

test("copy action copies artifact body to clipboard", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");

  await page.evaluate(() => {
    window.localStorage.removeItem("copied-artifact-body");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          window.localStorage.setItem("copied-artifact-body", value);
          return Promise.resolve();
        },
      },
    });
  });

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("copied-artifact-body")))
    .toBe('export function ViewerShell() {\n  return <main>Fragment-powered artifact viewer shell</main>;\n}');
});

test("copy action shows failure when clipboard API and execCommand fallback fail", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");

  await page.evaluate(() => {
    const origExec = document.execCommand.bind(document);
    document.execCommand = (commandId: string, showUI?: boolean, value?: string | null) => {
      if (commandId === "copy") {
        return false;
      }
      return origExec(commandId, showUI, value ?? undefined);
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("denied")),
      },
    });
  });

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copy failed" })).toBeVisible();
});

test("invalid payloads fail gracefully", async ({ page }) => {
  const decodeErrorMessage = "The fragment payload could not be decoded as valid JSON.";
  await goToHash(page, invalidFragments.malformed);
  await waitForViewerState(page, "error");
  await expect(page.locator('[data-testid="viewer-shell"]')).toContainText(decodeErrorMessage);
});
