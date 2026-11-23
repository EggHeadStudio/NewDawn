import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175/NewDawn/',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/NewDawn/',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
