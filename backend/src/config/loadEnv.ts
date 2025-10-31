import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const resolveFromBackendRoot = (relativePath: string) =>
  path.resolve(__dirname, '..', '..', relativePath);

const loadEnvFile = (relativePath: string) => {
  const fullPath = resolveFromBackendRoot(relativePath);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: true });
  }
};

// Base .env (tracked) always loads first
loadEnvFile('.env');

const environment = process.env.NODE_ENV || 'development';

const candidates = [
  `.env.${environment}.local`,
  `.env.${environment}`,
  '.env.local',
];

candidates.forEach(loadEnvFile);
