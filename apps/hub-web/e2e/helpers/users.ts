import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const helpersDir = dirname(fileURLToPath(import.meta.url));
const e2eRoot = join(helpersDir, '..');

export const AUTH_DIR = join(e2eRoot, '.auth');
export const USERS_FILE = join(AUTH_DIR, 'users.json');

export const DEFAULT_E2E_PASSWORD = 'E2eHubLocal9!';

export const E2E_CADMIN = {
  email: 'e2e.cadmin@example.com',
  fullName: 'E2E Admin Hub',
} as const;

export const E2E_CSTAFF = {
  email: 'e2e.cstaff.levatraz@example.com',
  fullName: 'E2E Motorista Leva e Traz',
} as const;

export const E2E_CSTAFF_BANHO = {
  email: 'e2e.cstaff.banho@example.com',
  fullName: 'E2E Banho e Tosa',
} as const;

export const E2E_CSTAFF_CLINICA = {
  email: 'e2e.cstaff.clinica@example.com',
  fullName: 'E2E Clinica',
} as const;

export const E2E_CSTAFF_HOTEL = {
  email: 'e2e.cstaff.hotel@example.com',
  fullName: 'E2E Hotel e Creche',
} as const;

export const E2E_CSTAFF_CAIXA = {
  email: 'e2e.cstaff.caixa@example.com',
  fullName: 'E2E Caixa',
} as const;

export const E2E_CSTAFF_RECEPCAO = {
  email: 'e2e.cstaff.recepcao@example.com',
  fullName: 'E2E Recepcao',
} as const;

export const E2E_GUARDIAN = {
  fullName: '[E2E] Maria Tutor',
  taxId: '52998224725',
} as const;

export const E2E_PET = {
  name: '[E2E] Thor',
} as const;

export type E2EUserCreds = {
  email: string;
  password: string;
  fullName: string;
};

export type E2EUsersFile = {
  cadmin: E2EUserCreds;
  cstaff: E2EUserCreds;
  cstaffBath?: E2EUserCreds;
  cstaffClinic?: E2EUserCreds;
  cstaffHotel?: E2EUserCreds;
  cstaffCash?: E2EUserCreds;
  cstaffReception?: E2EUserCreds;
  clinicId: string;
  unitId: string;
  guardianName: string;
  petName: string;
};

function trimEnv(name: string): string {
  return (process.env[name] || '').trim();
}

export function provisionPassword(): string {
  return trimEnv('E2E_HUB_PASSWORD') || DEFAULT_E2E_PASSWORD;
}

export function readProvisionedUsers(): E2EUsersFile | null {
  if (!existsSync(USERS_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(USERS_FILE, 'utf8')) as E2EUsersFile;
    if (!raw?.cadmin?.email || !raw?.cadmin?.password) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeProvisionedUsers(data: E2EUsersFile) {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(USERS_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function apiBaseUrl(): string {
  return (
    trimEnv('E2E_API_URL') ||
    trimEnv('VITE_API_URL') ||
    trimEnv('API_URL') ||
    trimEnv('REACT_APP_API_URL') ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
