import { expect, test } from "@playwright/test";
import { getFragmentHash, invalidFragments } from "../fixtures/payloads";
import { goToHash, stabilizePage, waitForRendererReady, waitForViewerState } from "./helpers";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

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
  await expect(page.getByRole("heading", { name: /create a link/i })).toBeVisible();
  await expect(page.getByText(/artifact content lives in the URL fragment/i)).toBeVisible();
  await expect(page.getByText(/the static host does not receive artifact content/i)).toBeVisible();
  await expect(page.getByText(/browser history, screenshots, copied messages, extensions/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /github/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /payload format docs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /safety.*security page/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /openclaw/i })).toBeVisible();
});

test("links to the public security page", async ({ page }) => {
  await waitForViewerState(page, "empty");

  await page.getByRole("link", { name: "Security" }).first().click();

  await expect(page).toHaveURL(/\/security\/?$/);
  await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
  await expect(page.getByText("Artifact payloads are not sent to the static host as part of the initial page request.")).toBeVisible();
  await expect(page.getByText("Fragment payloads stay out of the HTTP request path")).toBeVisible();
  await expect(page.getByText("React Markdown is configured with skipHtml")).toBeVisible();
  await expect(page.getByText("Mermaid runs with securityLevel: \"strict\"")).toBeVisible();
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
  // Compact header: the fragment is `#<1-char codec tag>…`, never the legacy `#agent-render=…`.
  await expect(generatedLink).not.toHaveValue(/#agent-render=/);
  await expect(generatedLink).toHaveValue(/\/#\w/);
  await expect(page.getByText(/chars$/).first()).toBeVisible();
  const linkValue = await generatedLink.inputValue();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("copied-link"))).toBe(linkValue);

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
  // Compact fences mount the Pierre file surface without wrapping.
  await expect(page.locator(".markdown-code-frame .code-renderer-shell.is-compact diffs-container").first()).toBeVisible();

  await page.evaluate(() => {
    window.__printCalled = false;
    window.print = () => {
      window.__printCalled = true;
    };
  });

  await page.getByRole("button", { name: "Print" }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__printCalled))).toBe(true);
});

test("edits an open markdown artifact and reshares it as a new link", async ({ page }) => {
  const beforeHash = getFragmentHash("Maintainer kickoff");
  await goToHash(page, beforeHash);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");

  await page.getByRole("button", { name: "Edit" }).click();
  // The edit surface is a Pierre CodeView contenteditable inside shadow DOM.
  const editor = page
    .getByTestId("artifact-editor-body")
    .locator("[contenteditable='true']")
    .first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+A");
  await editor.pressSequentially("# Maintainer kickoff\n\nEdited in the viewer.", {
    delay: 30,
  });
  await page.getByRole("button", { name: "plain", exact: true }).click();

  await page.getByRole("button", { name: "Generate new link" }).click();
  await expect(page.getByTestId("artifact-editor-result")).toBeVisible();
  await page.getByRole("button", { name: "Preview here" }).click();

  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");
  await expect(page.getByText("Edited in the viewer.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(beforeHash);
});

test("edits an open code artifact and reshares it as a new link", async ({ page }) => {
  const beforeHash = getFragmentHash("Viewer bootstrap");
  await goToHash(page, beforeHash);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "code");

  await page.getByRole("button", { name: "Edit" }).click();
  const codeEditor = page
    .getByTestId("artifact-editor-body")
    .locator("[contenteditable='true']")
    .first();
  await expect(codeEditor).toBeVisible();
  // Pierre re-renders the editable surface per change, so keystrokes need spacing to stay aligned.
  await codeEditor.click();
  await page.keyboard.press("Control+A");
  await codeEditor.pressSequentially('export const value = "edited";', { delay: 30 });
  await page.getByRole("button", { name: "plain", exact: true }).click();
  await page.getByRole("button", { name: "Generate new link" }).click();
  await expect(page.getByTestId("artifact-editor-result")).toBeVisible();
  await page.getByRole("button", { name: "Preview here" }).click();

  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "code");
  await expect(page.getByTestId("renderer-code")).toContainText('export const value = "edited"');
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe(beforeHash);
});

test("keeps other bundle artifacts when resharing an edited one", async ({ page }) => {
  const bundle = {
    v: 1,
    codec: "plain",
    title: "Edit bundle",
    activeArtifactId: "notes",
    artifacts: [
      {
        id: "notes",
        kind: "markdown",
        title: "Notes",
        filename: "notes.md",
        content: "# Notes\n\nOriginal bundle notes.",
      },
      {
        id: "manifest",
        kind: "json",
        title: "Manifest",
        filename: "manifest.json",
        content: '{\n  "kept": true\n}',
      },
    ],
  } satisfies PayloadEnvelope;

  await goToHash(page, `#${encodeEnvelope(bundle)}`);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");

  await page.getByRole("button", { name: "Edit" }).click();
  const bundleEditor = page
    .getByTestId("artifact-editor-body")
    .locator("[contenteditable='true']")
    .first();
  await expect(bundleEditor).toBeVisible();
  await bundleEditor.click();
  await page.keyboard.press("Control+A");
  await bundleEditor.pressSequentially("# Notes\n\nCorrected bundle notes.", { delay: 30 });
  await page.getByRole("button", { name: "plain", exact: true }).click();
  await page.getByRole("button", { name: "Generate new link" }).click();
  await expect(page.getByTestId("artifact-editor-result")).toBeVisible();
  await page.getByRole("button", { name: "Preview here" }).click();

  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");
  await expect(page.getByText("Corrected bundle notes.")).toBeVisible();

  await page.getByRole("button", { name: /Open artifact Manifest/i }).click();
  await expect(page.locator("[data-active-kind='json']")).toBeVisible();
  await waitForRendererReady(page, "json");
  await expect(page.locator(".json-tree-shell")).toContainText("kept");
});

test("renders markdown raw view on the highlighted file surface", async ({ page }) => {
  const plainMarkdownEnvelope = {
    v: 1,
    codec: "plain",
    activeArtifactId: "notes",
    artifacts: [
      {
        id: "notes",
        kind: "markdown",
        title: "Plain notes",
        filename: "notes.md",
        content: "# Plain notes\n\nNo fenced code here.",
      },
    ],
  } satisfies PayloadEnvelope;

  await goToHash(page, `#${encodeEnvelope(plainMarkdownEnvelope)}`);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");

  await page.getByRole("button", { name: /^Raw$/ }).click();

  const rawView = page.getByTestId("renderer-markdown-raw");
  await expect(rawView).toContainText("No fenced code here.");
  await expect(rawView.locator("[data-testid='renderer-code'][data-renderer-ready='true']")).toHaveCount(1);
});

test("renders code payloads", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(
    page.locator("[data-testid='renderer-code'] diffs-container").first(),
  ).toBeVisible();
});

test("renders arx2 fragments through the viewer", async ({ page }) => {
  const hash = "#agent-render=v1.arx2.1.B.G5YAoIzUVnkjvNDRuYkN71ZNo8KBFL0uoqsrTCc3P6gd25KyFmaWWi2GPGVBSQbV9vIA_tfs6WTMRdo0IIKRQEIMsoI36RDB7jr8YJq3abcYIzEpGs1Ady3VxyHdC-IyHyBG9yZRLJ0t5ClN5wftjQU";

  await goToHash(page, hash);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "code");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.getByText("viewer-shell.tsx").first()).toBeVisible();
});

test("renders arx3 fragments through the viewer", async ({ page }) => {
  const hash = "#agent-render=v1.arx3.1.B.Gz0AGBSh0s1uS-13u93SKE5yUrMgFAFBAxtwAhJQmOks54ADECrAEqH_Fwaf-xXuTLWNpXtgkc7IlAg";

  await goToHash(page, hash);
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "code");
  await expect(page.locator("[data-active-kind='code']")).toBeVisible();
  await expect(page.getByText("arx3-sample.ts").first()).toBeVisible();
});

test("renders multi-file diffs without mutating the payload hash", async ({ page }) => {
  await goToHash(page, getFragmentHash("Phase 1 sample diff"));
  await waitForViewerState(page, "artifact");
  const beforeHash = await page.evaluate(() => window.location.hash);
  await expect(page.locator(".patch-file-section")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator(".patch-file-tree")
        .evaluate((tree) => tree.shadowRoot?.querySelectorAll('button[data-type="item"][data-item-type="file"]').length ?? 0),
    )
    .toBe(2);
  await page.locator(".patch-file-tree").evaluate((tree) => {
    const items = tree.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-type="item"][data-item-type="file"]');
    items?.item(items.length - 1).click();
  });
  await expect
    .poll(() =>
      page.locator(".patch-file-tree").evaluate((tree) => {
        const items = tree.shadowRoot?.querySelectorAll<HTMLButtonElement>('button[data-type="item"][data-item-type="file"]');
        return items?.item(items.length - 1).hasAttribute("data-item-selected") ?? false;
      }),
    )
    .toBe(true);
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(beforeHash);
});

test("shows the editable-files tree inside the editor and focuses the selected file", async ({ page }) => {
  await goToHash(page, getFragmentHash("Phase 1 sample diff"));
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "diff");

  await page.getByRole("button", { name: "Edit" }).click();
  const editor = page.getByTestId("artifact-editor");
  await expect(editor).toBeVisible();
  const editorBody = page.getByTestId("artifact-editor-body");
  await expect(editorBody).toBeVisible();
  const editorTree = page.getByTestId("artifact-editor-frame").locator(".patch-file-tree");
  await expect
    .poll(() =>
      editorTree.evaluate(
        (tree) =>
          tree.shadowRoot?.querySelector('button[data-type="item"][data-item-path="src/version.ts"]') instanceof
          HTMLButtonElement,
      ),
    )
    .toBe(true);

  // Wait for the deferred Pierre editor chunk to finish mounting the editable element.
  await expect
    .poll(() =>
      editorBody.evaluate((frame) => {
        let found = false;
        const visit = (root: ParentNode) => {
          for (const el of Array.from(root.children)) {
            if (el.getAttribute("contenteditable") === "true") {
              found = true;
            }
            visit(el);
            if (el.shadowRoot) {
              visit(el.shadowRoot);
            }
          }
        };
        visit(frame);
        return found;
      }),
    )
    .toBe(true);

  await editorTree.evaluate((tree) => {
    tree.shadowRoot
      ?.querySelector<HTMLButtonElement>('button[data-type="item"][data-item-path="src/version.ts"]')
      ?.click();
  });
  // The patch caret nav scrolls the CodeView (`.artifact-body-editor` is its scroll root) to
  // the file's `diff --git` section and lands focus on the editable surface inside it.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector<HTMLElement>(".artifact-body-editor")?.scrollTop ?? 0,
      ),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frame = document.querySelector('[data-testid="artifact-editor-body"]');
        return frame?.contains(document.activeElement) ?? false;
      }),
    )
    .toBe(true);
});

test("renders rich diffs in shadow DOM without an external stylesheet", async ({ page }) => {
  await goToHash(page, getFragmentHash("Phase 1 sample diff"));
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "diff");
  await expect(page.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "rich");
  await expect
    .poll(() => page.evaluate(() => Array.from(document.querySelectorAll(".patch-file-section *")).some((element) => element.shadowRoot !== null)))
    .toBe(true);

  const stylesheetHrefs = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]'), (link) => link.getAttribute("href") ?? ""));
  expect(stylesheetHrefs.some((href) => href.includes("diff-view"))).toBe(false);
});

test("shows the raw patch fallback for invalid unified diffs", async ({ page }) => {
  const fallbackDiffEnvelope = {
    v: 1,
    codec: "plain",
    activeArtifactId: "notes",
    artifacts: [
      {
        id: "notes",
        kind: "diff",
        title: "notes.patch",
        filename: "notes.patch",
        patch: "not a unified diff\njust plain review notes\n",
      },
    ],
  } satisfies PayloadEnvelope;

  await goToHash(page, `#${encodeEnvelope(fallbackDiffEnvelope)}`);
  await waitForViewerState(page, "artifact");
  await expect(page.getByTestId("renderer-diff")).toHaveAttribute("data-diff-state", "fallback");
  await expect(page.locator('[data-testid="viewer-shell"][data-renderer-ready="true"]')).toBeVisible();
  await expect(page.getByTestId("renderer-diff-fallback-raw")).toContainText("not a unified diff");
});

test.describe("mobile UX", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("defaults narrow diff views to unified and gates split mode", async ({ page }) => {
    await goToHash(page, getFragmentHash("Phase 1 sample diff"));
    await waitForViewerState(page, "artifact");
    await waitForRendererReady(page, "diff");

    const diffRenderer = page.getByTestId("renderer-diff");
    const patchTree = page.locator(".patch-file-tree");
    await expect(diffRenderer).toHaveAttribute("data-mobile-layout", "true");
    await expect(diffRenderer).toHaveAttribute("data-diff-mode", "unified");
    await expect(page.getByRole("button", { name: "Open split columns" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Split$/ })).toHaveCount(0);
    await expect(patchTree).toBeVisible();

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

test("renders CSV raw view on the highlighted file surface", async ({ page }) => {
  await goToHash(page, getFragmentHash("Data export preview"));
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "csv");

  await page.getByRole("button", { name: /^Raw$/ }).click();

  const rawView = page.getByTestId("renderer-csv-raw");
  await expect(rawView).toContainText("artifact,kind,summary");
  await expect(rawView.locator("[data-testid='renderer-code'][data-renderer-ready='true']")).toHaveCount(1);
});

test("renders JSON tree and raw views", async ({ page }) => {
  await goToHash(page, getFragmentHash("arx showcase"));
  await waitForViewerState(page, "artifact");
  await page.getByRole("button", { name: /Open artifact Artifact manifest/i }).click();
  await expect(page.locator("[data-active-kind='json']")).toBeVisible();
  await expect(page.locator(".json-tree-shell")).toBeVisible();
  await page.getByRole("button", { name: "Raw" }).click();
  await expect(page.getByTestId("renderer-json-raw")).toBeVisible();
  await expect(page.locator(".json-renderer-shell diffs-container")).toHaveCount(1);
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
  await expect(page.getByRole("heading", { name: /create a link/i })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Copied" }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("copied-artifact-body")))
    .toBe('export function ViewerShell() {\n  return <main>Fragment-powered artifact viewer shell</main>;\n}');
});

test("markdown link action copies the current URL as a markdown link", async ({ page }) => {
  await goToHash(page, getFragmentHash("Viewer bootstrap"));
  await waitForViewerState(page, "artifact");

  await page.evaluate(() => {
    window.localStorage.removeItem("copied-markdown-link");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          window.localStorage.setItem("copied-markdown-link", value);
          return Promise.resolve();
        },
      },
    });
  });

  await page.getByRole("button", { name: "Markdown link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => window.localStorage.getItem("copied-markdown-link"));
  const href = await page.evaluate(() => window.location.href);
  expect(copied).toBe(`[viewer-shell.tsx](${href})`);
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
