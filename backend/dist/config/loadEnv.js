"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const chalk_1 = __importDefault(require("chalk"));
const resolveFromBackendRoot = (relativePath) => path_1.default.resolve(__dirname, '..', '..', relativePath);
const loadEnvFile = (relativePath, override = false) => {
    const fullPath = resolveFromBackendRoot(relativePath);
    if (!fs_1.default.existsSync(fullPath))
        return false;
    dotenv_1.default.config({
        path: fullPath,
        override: override, // permite sobrescrever para arquivos mais específicos
    });
    console.log(chalk_1.default.green(`🌱 Variáveis carregadas de ${relativePath}`));
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
].filter((item) => Boolean(item));
// Carrega todos os arquivos encontrados, do mais genérico ao mais específico
// Arquivos mais específicos sobrescrevem os genéricos
let found = false;
for (const { file, override } of candidates) {
    if (loadEnvFile(file, override)) {
        found = true;
    }
}
if (!found) {
    console.warn(chalk_1.default.yellow('⚠️  Nenhum arquivo .env encontrado — usando variáveis do sistema.'));
}
// Garante que NODE_ENV sempre exista
process.env.NODE_ENV = environment;
// Validação básica das variáveis essenciais
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.warn(chalk_1.default.red(`🚨 Variáveis ausentes: ${missing.join(', ')} — verifique seu .env.${environment} ou .env.local`));
}
console.log(chalk_1.default.cyan(`🚀 Ambiente: ${environment}`));
