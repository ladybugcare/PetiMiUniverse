"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/index.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("./config/supabase.js");
// 🔹 Importa rotas
const pets_js_1 = __importDefault(require("./routes/pets.js"));
const clinics_js_1 = __importDefault(require("./routes/clinics.js"));
const vets_js_1 = __importDefault(require("./routes/vets.js"));
const demands_js_1 = __importDefault(require("./routes/demands.js"));
const applications_js_1 = __importDefault(require("./routes/applications.js"));
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const specialties_js_1 = __importDefault(require("./routes/specialties.js"));
const marketplace_js_1 = __importDefault(require("./routes/marketplace.js"));
const marketplaceMessages_js_1 = __importDefault(require("./routes/marketplaceMessages.js"));
const units_js_1 = __importDefault(require("./routes/units.js"));
const clinicUsers_js_1 = __importDefault(require("./routes/clinicUsers.js"));
const statistics_js_1 = __importDefault(require("./routes/statistics.js"));
const demandPositions_js_1 = __importDefault(require("./routes/demandPositions.js"));
const adminRoutes_js_1 = __importDefault(require("./routes/adminRoutes.js"));
const supportTickets_js_1 = __importDefault(require("./routes/supportTickets.js"));
const notifications_js_1 = __importDefault(require("./routes/notifications.js"));
// 🔹 Carrega variáveis de ambiente
dotenv_1.default.config();
// 🔹 Inicializa o Express
const app = (0, express_1.default)();
// 🔹 Configuração de CORS (com suporte a múltiplos domínios)
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002', // React dev server
    'https://peti-vet-git-staging-petivet.vercel.app',
    'https://peti-vet-petivet.vercel.app', // Vercel production
    process.env.FRONTEND_URL,
].filter((origin) => Boolean(origin));
const normalizedOrigins = allowedOrigins.map((origin) => origin.replace(/\/$/, ''));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const normalizedOrigin = origin.replace(/\/$/, '');
        if (normalizedOrigins.includes(normalizedOrigin) ||
            allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24h
}));
// 🔹 Aumenta limite de payload (para imagens base64)
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// 🔹 Rotas principais
app.use('/auth', auth_js_1.default);
app.use('/pets', pets_js_1.default);
app.use('/clinics', clinics_js_1.default);
app.use('/vets', vets_js_1.default);
app.use('/demands', demands_js_1.default);
app.use('/applications', applications_js_1.default);
app.use('/specialties', specialties_js_1.default);
app.use('/marketplace', marketplace_js_1.default);
app.use('/marketplace/messages', marketplaceMessages_js_1.default);
app.use('/units', units_js_1.default);
app.use('/clinic-users', clinicUsers_js_1.default);
app.use('/statistics', statistics_js_1.default);
app.use('/demand-positions', demandPositions_js_1.default);
app.use('/admin', adminRoutes_js_1.default);
app.use('/support', supportTickets_js_1.default);
app.use('/notifications', notifications_js_1.default);
// 🔹 Healthcheck
app.get('/', (req, res) => {
    res.json({ message: '🐾 PetiVet API is running!' });
});
// 🔹 Endpoint de teste de conexão com Supabase
app.get('/test-supabase', async (req, res) => {
    const { data, error } = await supabase_js_1.supabase.from('test').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ data });
});
// 🔹 Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🐾 Server running on port ${PORT}`);
});
