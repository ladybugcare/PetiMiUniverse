#!/usr/bin/env node
/**
 * Aplica create_hub_clinical_attachments.sql no Postgres remoto via DATABASE_URL.
 * Uso: DATABASE_URL='postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres' node scripts/apply-clinical-attachments-migration.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../database_migrations/petimi_hub/create_hub_clinical_attachments.sql');

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('Defina DATABASE_URL (connection string do Supabase → Settings → Database).');
    process.exit(1);
  }
  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('Instale pg: npm install pg --no-save (na pasta backend)');
    process.exit(1);
  }
  const sql = readFileSync(sqlPath, 'utf8');
  const client = new pg.default.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration aplicada:', sqlPath);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
