import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env') });

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'pixel7', use: { ...devices['Pixel 7'] } },
    { name: 'iphone14', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter web exec next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
