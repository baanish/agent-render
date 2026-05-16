import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4401);
const cleanColorEnv = "env -u NO_COLOR";

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
  },
  webServer: {
    command: `${cleanColorEnv} NEXT_PUBLIC_BASE_PATH=/agent-render npm run build && ${cleanColorEnv} PORT=${port} NEXT_PUBLIC_BASE_PATH=/agent-render npm run preview`,
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
