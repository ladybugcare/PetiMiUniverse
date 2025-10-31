"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const resolveFromBackendRoot = (relativePath) => path_1.default.resolve(__dirname, '..', '..', relativePath);
const loadEnvFile = (relativePath) => {
    const fullPath = resolveFromBackendRoot(relativePath);
    if (fs_1.default.existsSync(fullPath)) {
        dotenv_1.default.config({ path: fullPath, override: true });
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
