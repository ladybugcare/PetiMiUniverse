import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const resolveFromBackendRoot = (relativePath: string) =>
  path.resolve(__dirname, '..', '..', relativePath);

const loadEnvFile = (relativePath: string) => {
  const fullPath = resolveFromBackendRoot(relativePath);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  dotenv.config({
    path: fullPath,
    // Never override variables already defined by the runtime (Render, CI, etc).
    override: false
  });
};

const environment = process.env.NODE_ENV || 'development';

// Load files from highest to lowest precedence (mimics CRA behaviour).
const candidates = [
  `.env.${environment}.local`,
  `.env.${environment}`,
  environment !== 'test' ? '.env.local' : undefined,
  '.env'
].filter((file): file is string => Boolean(file));

candidates.forEach(loadEnvFile);

// Ensure NODE_ENV is always defined for downstream code.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = environment;
}
