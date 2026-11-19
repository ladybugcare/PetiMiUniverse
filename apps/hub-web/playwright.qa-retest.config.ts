import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { loadDotEnvFile } from './e2e/helpers/dotenv';

const appRoot = dirname(fileURLToPath(import.meta.url));
loadDotEnvFile(join(appRoot, '.env.local'));

export default defineConfig({
  testDir: './e2e',
  testMatch: /qa-consulta-retest\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '/tmp/qa_retest_playwright.json' }]],
  timeout: 240_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.E2E_HUB_BASE_URL || 'http://localhost:3002',
    locale: 'pt-BR',
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'qa-retest', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: process.env.E2E_HUB_BASE_URL || 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
