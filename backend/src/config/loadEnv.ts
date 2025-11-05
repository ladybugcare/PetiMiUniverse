import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

const resolveFromBackendRoot = (relativePath: string) =>
  path.resolve(__dirname, '..', '..', relativePath);

const loadEnvFile = (relativePath: string) => {
  const fullPath = resolveFromBackendRoot(relativePath);
  if (!fs.existsSync(fullPath)) return false;

  dotenv.config({
    path: fullPath,
    override: false, // não sobrescreve variáveis já definidas no ambiente (Render, CI etc)
  });

  console.log(chalk.green(`🌱 Variáveis carregadas de ${relativePath}`));
  return true;
};

// Detecta o ambiente atual
const environment = process.env.NODE_ENV || 'development';

// Lista de possíveis arquivos, do mais específico ao genérico
const candidates = [
  `.env.${environment}.local`,
  `.env.${environment}`,
  environment !== 'test' ? '.env.local' : undefined,
  '.env',
].filter(Boolean) as string[];

// Carrega o primeiro arquivo encontrado
let found = false;
for (const file of candidates) {
  if (loadEnvFile(file)) {
    found = true;
    break; // para no primeiro encontrado
  }
}

if (!found) {
  console.warn(chalk.yellow('⚠️  Nenhum arquivo .env encontrado — usando variáveis do sistema.'));
}

// Garante que NODE_ENV sempre exista
process.env.NODE_ENV = environment;

// Validação básica das variáveis essenciais
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.warn(
    chalk.red(
      `🚨 Variáveis ausentes: ${missing.join(', ')} — verifique seu .env.${environment} ou .env.local`
    )
  );
}

console.log(chalk.cyan(`🚀 Ambiente: ${environment}`));
