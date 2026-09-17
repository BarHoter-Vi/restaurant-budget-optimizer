import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  /**
   * Chromium is used for every project, with mobile emulation from the device
   * descriptors. `channel: 'chrome'` reuses the Chrome already on the machine,
   * so nothing has to be downloaded; CI installs Playwright's own build instead
   * (see .github/workflows/ci.yml).
   */
  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 12'], browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome' },
    },
    {
      name: 'android-small',
      use: { ...devices['Galaxy S8'], browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: {
    command: 'BASE_PATH=/ npm run build && BASE_PATH=/ npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
