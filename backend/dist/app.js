"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_js_1 = require("./config/supabase.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const rateLimiter_js_1 = require("./middleware/rateLimiter.js");
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
// Permite origens locais (portas 3001 e 3002 para React dev server) e ambientes de deploy
const allowedOrigins = [
    'http://localhost:3000', // Backend local (caso frontend rode na mesma porta)
    'http://localhost:3001', // Frontend local - porta alternativa
    'http://localhost:3002', // Frontend local - porta padrão React dev server
    'https://peti-vet-git-staging-petivet.vercel.app', // Staging
    'https://peti-vet-petivet.vercel.app', // Vercel production
    process.env.FRONTEND_URL, // Variável de ambiente (permite configuração flexível)
].filter((origin) => Boolean(origin));
const normalizedOrigins = allowedOrigins.map((origin) => origin.replace(/\/$/, ''));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Permite requisições sem origem apenas em desenvolvimento
        if (!origin) {
            if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        }
        const normalizedOrigin = origin.replace(/\/$/, '');
        // Verifica se a origem está na lista de permitidas
        const isAllowed = normalizedOrigins.includes(normalizedOrigin) ||
            allowedOrigins.includes(origin) ||
            allowedOrigins.includes(normalizedOrigin);
        if (isAllowed) {
            // Log para debug (apenas em staging/dev)
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[CORS] Allowed origin: ${origin}`);
            }
            // Retorna a origem exata da requisição para o header CORS
            // Isso garante que o header access-control-allow-origin seja a origem correta
            callback(null, origin);
        }
        else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            console.warn(`[CORS] Normalized: ${normalizedOrigin}`);
            console.warn(`[CORS] Allowed origins:`, allowedOrigins);
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
// 🔹 Rate limiting global (aplicado a todas as rotas)
app.use(rateLimiter_js_1.generalLimiter);
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
// 🔹 Healthcheck melhorado (verifica dependências)
app.get('/', async (req, res) => {
    try {
        // Verificar conexão com Supabase
        const { error: supabaseError } = await supabase_js_1.supabase.from('clinics').select('id').limit(1);
        const health = {
            status: 'healthy',
            message: '🐾 PetiVet API is running!',
            timestamp: new Date().toISOString(),
            services: {
                database: supabaseError ? 'unhealthy' : 'healthy',
            },
        };
        if (supabaseError) {
            health.status = 'degraded';
            health.services.database = 'unhealthy';
        }
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            message: 'Erro ao verificar saúde do sistema',
            timestamp: new Date().toISOString(),
        });
    }
});
// 🔹 Endpoint de teste de conexão com Supabase
app.get('/test-supabase', async (req, res) => {
    const { data, error } = await supabase_js_1.supabase.from('test').select('*');
    if (error)
        return res.status(400).json({ error });
    res.json({ data });
});
// 🔹 Swagger API Documentation (apenas em desenvolvimento/staging)
// Carregado dinamicamente para evitar erros se não instalado
if (process.env.NODE_ENV !== 'production') {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const swaggerUi = require('swagger-ui-express');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { swaggerSpec } = require('./config/swagger.js');
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }
    catch (error) {
        // Swagger não é crítico, apenas log se falhar
        console.warn('Swagger não disponível:', error);
    }
}
// ❌ Fallback para rotas inexistentes
app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado' });
});
// 🔹 Middleware de tratamento de erros global (deve ser o último)
app.use(errorHandler_js_1.errorHandler);
exports.default = app;
