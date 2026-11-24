import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { loadDotEnvFile } from './e2e/helpers/dotenv';

const appRoot = dirname(fileURLToPath(import.meta.url));
loadDotEnvFile(join(appRoot, '.env.staging.local'));
loadDotEnvFile(join(appRoot, '.env.local'));
if (!process.env.E2E_HUB_BASE_URL) process.env.E2E_HUB_BASE_URL = 'http://localhost:3002';
if (!process.env.E2E_API_URL) process.env.E2E_API_URL = 'http://localhost:3000';
if (!process.env.E2E_ALLOW_REMOTE_API) {
  process.env.VITE_API_URL = process.env.E2E_API_URL;
}

const hubBaseUrl = process.env.E2E_HUB_BASE_URL || 'http://localhost:3002';
const isRemoteHub = /^https?:\/\//i.test(hubBaseUrl) && !/localhost|127\.0\.0\.1/i.test(hubBaseUrl);

export default defineConfig({
  testDir: './e2e',
  testMatch: /etapa-b-relatorios\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/etapa_b_playwright.json' }],
    ['html', { open: 'never', outputFolder: '/tmp/etapa_b_playwright-report' }],
  ],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: hubBaseUrl,
    locale: 'pt-BR',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'etapa-b', use: { ...devices['Desktop Chrome'] } }],
  ...(isRemoteHub
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: hubBaseUrl,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }),
});
