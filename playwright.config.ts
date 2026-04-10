import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './src/tests',
  globalSetup: './src/tests/global-setup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['line'],
    ['json', { outputFile: 'logs/test-results.json' }],
    ['html', { open: 'never' }],
  ],

  use: {
    storageState: '.test-cache/auth.json',
    headless: process.env.CI ? true : false,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results',
});
