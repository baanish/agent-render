import { expect, test } from "@playwright/test";
import { codecPickerLabel } from "@/lib/payload/schema";
import { goToHash, waitForRendererReady, waitForViewerState } from "./helpers";

declare global {
  interface Window {
    __payloadWorkerActivity?: {
      urls: string[];
      posted: number;
      completed: number;
      ticksWhileBusy: number;
    };
  }
}

test("encodes and decodes in the exported subpath worker while the page stays responsive", async ({ page }) => {
  await page.addInitScript(() => {
    const activity = { urls: [] as string[], posted: 0, completed: 0, ticksWhileBusy: 0 };
    window.__payloadWorkerActivity = activity;
    let pending = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private readonly payloadWorker: boolean;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.payloadWorker = options?.name === "agent-render-codec";
        if (this.payloadWorker) {
          activity.urls.push(String(url));
          this.addEventListener("message", () => {
            pending -= 1;
            activity.completed += 1;
          });
        }
      }

      postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
        if (this.payloadWorker) {
          pending += 1;
          activity.posted += 1;
        }
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
    setInterval(() => {
      if (pending > 0) activity.ticksWhileBusy += 1;
    }, 10);
  });

  await goToHash(page);
  await waitForViewerState(page, "empty");
  await page.getByLabel("Title").fill("Worker responsiveness");
  const content = Array.from({ length: 350 }, (_, i) =>
    `Paragraph ${i}: a static fragment carries this artifact locally, including punctuation () [] and Unicode café.`,
  ).join("\n\n");
  await page.getByRole("textbox", { name: /^Content\b/ }).fill(content);
  await page.getByRole("button", { name: codecPickerLabel("arx6"), exact: true }).click();
  await page.getByRole("button", { name: "Generate link" }).click();
  await expect(page.getByLabel("Generated agent-render link")).toBeVisible({ timeout: 30_000 });

  const encoded = await page.evaluate(() => window.__payloadWorkerActivity!);
  expect(encoded.urls).toHaveLength(1);
  expect(new URL(encoded.urls[0]).pathname).toMatch(/^\/agent-render\/_next\//);
  expect(encoded.posted).toBe(1);
  expect(encoded.completed).toBe(1);
  // A resolved async function on the main thread cannot satisfy this while its model is running.
  expect(encoded.ticksWhileBusy).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Preview here" }).click();
  await waitForViewerState(page, "artifact");
  await waitForRendererReady(page, "markdown");
  await expect(page.locator(".markdown-article")).toContainText("Paragraph 349:");
  const decoded = await page.evaluate(() => window.__payloadWorkerActivity!);
  expect(decoded.posted).toBe(2);
  expect(decoded.completed).toBe(2);
  expect(decoded.ticksWhileBusy).toBeGreaterThan(encoded.ticksWhileBusy);
});
