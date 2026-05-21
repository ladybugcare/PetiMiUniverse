"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const clinics_1 = __importDefault(require("./routes/clinics"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const vets_1 = __importDefault(require("./routes/vets"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// 🔓 Configurações básicas
app.use((0, cors_1.default)({ origin: 'http://localhost:3002', credentials: true }));
app.use(express_1.default.json());
// 🚀 Rotas principais
app.use('/clinics', clinics_1.default);
app.use('/admin', adminRoutes_1.default);
app.use('/vets', vets_1.default);
// 🩵 Healthcheck
app.get('/', (_req, res) => {
    res.send('PetMi Vet API is running 🐾');
});
// ❌ Fallback para rotas inexistentes
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado' });
});
exports.default = app;
