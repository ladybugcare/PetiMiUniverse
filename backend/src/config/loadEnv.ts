import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

const resolveFromBackendRoot = (relativePath: string) =>
  path.resolve(__dirname, '..', '..', relativePath);

const loadEnvFile = (relativePath: string, override: boolean = false) => {
  const fullPath = resolveFromBackendRoot(relativePath);
  if (!fs.existsSync(fullPath)) return false;

  dotenv.config({
    path: fullPath,
    override: override, // permite sobrescrever para arquivos mais específicos
  });

  console.log(chalk.green(`🌱 Variáveis carregadas de ${relativePath}`));
  return true;
};

// Detecta o ambiente atual
const environment = process.env.NODE_ENV || 'development';

// Lista de possíveis arquivos, do mais genérico ao mais específico
// Carregamos na ordem inversa para que os mais específicos sobrescrevam os genéricos
const candidates = [
  { file: '.env', override: false }, // Base - não sobrescreve variáveis do sistema
  ...(environment !== 'test' ? [{ file: '.env.local', override: true }] : []), // Local - sobrescreve .env
  { file: `.env.${environment}`, override: true }, // Ambiente específico - sobrescreve anteriores
  { file: `.env.${environment}.local`, override: true }, // Mais específico - sobrescreve todos
].filter((item): item is { file: string; override: boolean } => Boolean(item));

// Carrega todos os arquivos encontrados, do mais genérico ao mais específico
// Arquivos mais específicos sobrescrevem os genéricos
let found = false;
for (const { file, override } of candidates) {
  if (loadEnvFile(file, override)) {
    found = true;
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
