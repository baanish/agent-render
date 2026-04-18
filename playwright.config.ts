import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4401);

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: process.env.CI ? ["**/visual.spec.ts"] : undefined,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : [["list"]],
  expect: {
    toHaveScreenshot: {
      // Keep per-project snapshot names while removing platform-specific suffixes.
      pathTemplate: "{snapshotDir}/{testFilePath}-snapshots/{arg}{-projectName}{ext}",
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/agent-render/`,
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Playwright's default Accept prefers text/markdown first; the static preview server
    // then returns markdown for document requests and the client shell never hydrates.
    extraHTTPHeaders: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    },
  },
  webServer: {
    command: `NEXT_PUBLIC_BASE_PATH=/agent-render npm run build && PORT=${port} NEXT_PUBLIC_BASE_PATH=/agent-render npm run preview`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
