import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-edge",
      use: {
        ...devices["Desktop Edge"],
        channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api/v1",
      NEXT_PUBLIC_API_MODE: "mock",
      NEXT_PUBLIC_DEFAULT_TIMEZONE: "Asia/Ho_Chi_Minh",
    },
  },
});

