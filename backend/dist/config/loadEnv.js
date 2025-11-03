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
    if (!fs_1.default.existsSync(fullPath)) {
        return;
    }
    dotenv_1.default.config({
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
].filter((file) => Boolean(file));
candidates.forEach(loadEnvFile);
// Ensure NODE_ENV is always defined for downstream code.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = environment;
}
