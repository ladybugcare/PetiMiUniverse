import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { loadDotEnvFile } from './e2e/helpers/dotenv';

const appRoot = dirname(fileURLToPath(import.meta.url));
loadDotEnvFile(join(appRoot, '.env.staging.local'));
loadDotEnvFile(join(appRoot, '.env.local'));

const hubBaseUrl = process.env.E2E_HUB_BASE_URL || 'http://localhost:3002';
const isRemoteHub = /^https?:\/\//i.test(hubBaseUrl) && !/localhost|127\.0\.0\.1/i.test(hubBaseUrl);

export default defineConfig({
  testDir: './e2e',
  testMatch: /etapa-a-devolucoes\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/etapa_a_playwright.json' }],
    ['html', { open: 'never', outputFolder: '/tmp/etapa_a_playwright-report' }],
  ],
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: hubBaseUrl,
    locale: 'pt-BR',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Bypass Vercel: ver helpers/etapaA/vercelProtection.ts (não usar extraHTTPHeaders
    // global — quebraria CORS da API Railway).
  },
  projects: [{ name: 'etapa-a', use: { ...devices['Desktop Chrome'] } }],
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
