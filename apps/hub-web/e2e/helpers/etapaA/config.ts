import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvFile } from '../dotenv';

const helpersDir = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(helpersDir, '../../../../..');
const HUB_WEB_ROOT = join(helpersDir, '../../..');

let loaded = false;

export function ensureEtapaAEnv() {
  if (loaded) return;
  // Staging/smoke preenchem secrets; .env.local e E2E_* vencem para API/Hub locais.
  loadDotEnvFile(join(HUB_WEB_ROOT, '.env.staging.local'));
  const smokePath = join(REPO_ROOT, 'backend/.env.smoke.preprod.local');
  if (existsSync(smokePath)) loadDotEnvFile(smokePath);
  const preprodPath = join(REPO_ROOT, 'backend/.env.preprod.local');
  if (existsSync(preprodPath)) loadDotEnvFile(preprodPath);
  loadDotEnvFile(join(HUB_WEB_ROOT, '.env.local'));
  if (!process.env.E2E_HUB_BASE_URL) process.env.E2E_HUB_BASE_URL = 'http://localhost:3002';
  if (!process.env.E2E_API_URL) process.env.E2E_API_URL = 'http://localhost:3000';
  if (!process.env.E2E_ALLOW_REMOTE_API) {
    process.env.VITE_API_URL = process.env.E2E_API_URL;
  }
  loaded = true;
}

export function qaStagingPassword(): string {
  ensureEtapaAEnv();
  return (
    process.env.QA_STAGING_PASSWORD ||
    process.env.E2E_HUB_PASSWORD ||
    process.env.QA_STAGING_PW ||
    ''
  ).trim();
}

export function apiBaseUrl(): string {
  ensureEtapaAEnv();
  // Homologação local contra preprod DB: preferir API local com as correções.
  return (
    process.env.E2E_API_URL ||
    process.env.VITE_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function supabaseAuthConfig(): { url: string; anonKey: string } {
  ensureEtapaAEnv();
  const preprodPath = join(REPO_ROOT, 'backend/.env.preprod.local');
  let url = process.env.VITE_SUPABASE_URL || '';
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (existsSync(preprodPath)) {
    const txt = readFileSync(preprodPath, 'utf8');
    const pick = (k: string) => {
      const m = txt.match(new RegExp(`^${k}=(.+)$`, 'm'));
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
    };
    url = url || pick('SUPABASE_URL');
    anonKey = anonKey || pick('SUPABASE_ANON_KEY');
  }
  if (!url || !anonKey) {
    throw new Error('Supabase URL/anon ausentes — configure apps/hub-web/.env.staging.local');
  }
  return { url, anonKey };
}