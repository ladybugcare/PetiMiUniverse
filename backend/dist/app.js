"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
// loadEnv.ts é carregado automaticamente quando importamos supabase
const supabase_js_1 = require("./config/supabase.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const rateLimiter_js_1 = require("./middleware/rateLimiter.js");
const correlationId_js_1 = require("./middleware/correlationId.js");
// 🔹 Importa rotas
const pets_js_1 = __importDefault(require("./routes/pets.js"));
const clinics_js_1 = __importDefault(require("./routes/clinics.js"));
const vets_js_1 = __importDefault(require("./routes/vets.js"));
const freelancers_js_1 = __importDefault(require("./routes/freelancers.js"));
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
const messages_js_1 = __importDefault(require("./routes/messages.js"));
const messageReports_js_1 = __importDefault(require("./routes/messageReports.js"));
const health_js_1 = __importDefault(require("./routes/health.js"));
const demandInvites_js_1 = __importDefault(require("./routes/demandInvites.js"));
const workProof_js_1 = __importDefault(require("./routes/workProof.js"));
const index_js_1 = __importDefault(require("./modules/hub/routes/index.js"));
const publicQuotes_js_1 = __importDefault(require("./modules/hub/routes/publicQuotes.js"));
// 🔹 Variáveis de ambiente são carregadas automaticamente por loadEnv.ts
// quando importamos supabase (config/supabase.ts importa './loadEnv')
// Ordem de carregamento: .env.${NODE_ENV}.local > .env.${NODE_ENV} > .env.local > .env
// 🔹 Inicializa o Express
const app = (0, express_1.default)();
// 🔹 Helmet.js - Headers de segurança HTTP
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Permite inline styles (necessário para alguns componentes)
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'], // Permite imagens de qualquer origem HTTPS
            connectSrc: ["'self'", process.env.SUPABASE_URL || 'https://*.supabase.co'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Desabilitado para compatibilidade com Supabase
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Necessário para Supabase Storage
}));
// 🔹 Configuração de CORS (com suporte a múltiplos domínios via variáveis de ambiente)
// Lê origens permitidas de variáveis de ambiente
const getAllowedOrigins = () => {
    const origins = [];
    // Origens padrão para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        origins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002');
    }
    // Origens de staging
    if (process.env.STAGING_ORIGINS) {
        origins.push(...process.env.STAGING_ORIGINS.split(',').map((o) => o.trim()));
    }
    // Origens de produção
    if (process.env.PRODUCTION_ORIGINS) {
        origins.push(...process.env.PRODUCTION_ORIGINS.split(',').map((o) => o.trim()));
    }
    // Frontend URL (pode ser usado em qualquer ambiente)
    if (process.env.FRONTEND_URL) {
        origins.push(process.env.FRONTEND_URL);
    }
    // Fallback para origens hardcoded se não houver variáveis de ambiente (compatibilidade)
    if (origins.length === 0) {
        origins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'https://peti-vet-git-staging-petivet.vercel.app', 'https://staging.petivet.com.br', 'https://peti-vet-petivet.vercel.app', 'https://petivet.com.br');
    }
    return origins.filter((origin) => Boolean(origin));
};
const allowedOrigins = getAllowedOrigins();
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
        // Dev: acesso pelo IP da rede local (ex.: http://192.168.x.x:3001 no celular)
        const isLanDevOrigin = process.env.NODE_ENV === 'development' &&
            /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:(3000|3001|3002)$/.test(normalizedOrigin);
        // Verifica se a origem está na lista de permitidas
        const isAllowed = isLanDevOrigin ||
            normalizedOrigins.includes(normalizedOrigin) ||
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
// 🔹 Correlation ID middleware (deve ser um dos primeiros)
app.use(correlationId_js_1.correlationIdMiddleware);
// 🔹 Sanitização de inputs (proteção contra XSS)
// Aplicar em rotas que recebem dados do usuário
// Nota: Não aplicar em rotas de upload de arquivos (multer precisa do body raw)
// 🔹 Limites de payload por tipo de endpoint
// Limite padrão menor para segurança (10MB)
const defaultLimit = process.env.PAYLOAD_LIMIT_DEFAULT || '10mb';
// Limite maior apenas para endpoints de upload
app.use(express_1.default.json({ limit: defaultLimit }));
app.use(express_1.default.urlencoded({ limit: defaultLimit, extended: true }));
// Middleware para aumentar limite em rotas específicas de upload
app.use('/vets/upload-crmv', express_1.default.json({ limit: '5mb' }));
app.use('/freelancers/upload-certification', express_1.default.json({ limit: '5mb' }));
app.use('/marketplace/upload-images', express_1.default.json({ limit: '10mb' }));
// 🔹 Rate limiting global (aplicado a todas as rotas)
app.use(rateLimiter_js_1.generalLimiter);
// 🔹 Rotas principais
app.use('/auth', auth_js_1.default);
app.use('/pets', pets_js_1.default);
app.use('/clinics', clinics_js_1.default);
app.use('/vets', vets_js_1.default);
app.use('/freelancers', freelancers_js_1.default);
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
app.use('/api/messages', messages_js_1.default);
app.use('/api/messages/admin', messageReports_js_1.default);
app.use('/api', demandInvites_js_1.default);
app.use('/api', workProof_js_1.default);
app.use('/api/hub', index_js_1.default);
app.use('/api/public', publicQuotes_js_1.default);
app.use('/health', health_js_1.default);
// 🔹 Healthcheck melhorado (verifica dependências)
app.get('/', async (req, res) => {
    try {
        // Verificar conexão com Supabase
        const { error: supabaseError } = await supabase_js_1.supabase.from('clinics').select('id').limit(1);
        const health = {
            status: 'healthy',
            message: '🐾 PetMi Vet API is running!',
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
