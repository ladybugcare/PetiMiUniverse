// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
// loadEnv.ts é carregado automaticamente quando importamos supabase
import { supabase } from './config/supabase.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';

// 🔹 Importa rotas
import petRoutes from './routes/pets.js';
import clinicsRoutes from './routes/clinics.js';
import vetsRoutes from './routes/vets.js';
import freelancersRoutes from './routes/freelancers.js';
import demandsRoutes from './routes/demands.js';
import applicationsRoutes from './routes/applications.js';
import authRoutes from './routes/auth.js';
import specialtiesRoutes from './routes/specialties.js';
import marketplaceRoutes from './routes/marketplace.js';
import marketplaceMessagesRoutes from './routes/marketplaceMessages.js';
import unitsRoutes from './routes/units.js';
import clinicUsersRoutes from './routes/clinicUsers.js';
import statisticsRoutes from './routes/statistics.js';
import demandPositionsRoutes from './routes/demandPositions.js';
import adminRoutes from './routes/adminRoutes.js';
import supportTicketsRoutes from './routes/supportTickets.js';
import notificationsRoutes from './routes/notifications.js';
import messagesRoutes from './routes/messages.js';
import messageReportsRoutes from './routes/messageReports.js';
import healthRoutes, { liveHealthHandler } from './routes/health.js';
import demandInvitesRoutes from './routes/demandInvites.js';
import workProofRoutes from './routes/workProof.js';
import hubRoutes from './modules/hub/routes/index.js';
import publicQuotesRoutes from './modules/hub/routes/publicQuotes.js';
import publicComandasRoutes from './modules/hub/routes/publicComandas.js';

// 🔹 Variáveis de ambiente são carregadas automaticamente por loadEnv.ts
// quando importamos supabase (config/supabase.ts importa './loadEnv')
// Ordem de carregamento: .env.${NODE_ENV}.local > .env.${NODE_ENV} > .env.local > .env

// 🔹 Inicializa o Express
const app = express();

// Reverse proxy (Railway, Vercel, etc.): IP real do cliente para rate limit e logs
app.set('trust proxy', 1);

// 🔹 Helmet.js - Headers de segurança HTTP
app.use(
  helmet({
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
  })
);

// Liveness antes do CORS: probes (Railway, k8s, curl) não enviam Origin; o CORS global bloqueava com 500.
app.get('/health/live', liveHealthHandler);

// 🔹 Configuração de CORS (com suporte a múltiplos domínios via variáveis de ambiente)
// Lê origens permitidas de variáveis de ambiente
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];

  // Origens padrão para desenvolvimento
  // HUB_DEV_ONLY=true — não aceita PetMi Vet (3001); só Hub (3002) e API local (3000)
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:3000', 'http://localhost:3002');
    if (process.env.HUB_DEV_ONLY !== 'true') {
      origins.push('http://localhost:3001');
    }
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
    origins.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://peti-vet-git-staging-petivet.vercel.app',
      'https://staging.petivet.com.br',
      'https://peti-vet-petivet.vercel.app',
      'https://petivet.com.br'
    );
  }

  return origins.filter((origin): origin is string => Boolean(origin));
};

const allowedOrigins = getAllowedOrigins();

const normalizedOrigins = allowedOrigins.map((origin) =>
  origin.replace(/\/$/, '')
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origem apenas em desenvolvimento
      if (!origin) {
        if (
          process.env.NODE_ENV === 'development' ||
          process.env.NODE_ENV === 'staging' ||
          process.env.NODE_ENV === 'test'
        ) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      }
      
      const normalizedOrigin = origin.replace(/\/$/, '');

      // Dev: acesso pelo IP da rede local (ex.: http://192.168.x.x:3001 no celular)
      const lanPorts = process.env.HUB_DEV_ONLY === 'true' ? '3000|3002' : '3000|3001|3002';
      const isLanDevOrigin =
        process.env.NODE_ENV === 'development' &&
        new RegExp(`^http:\\/\\/192\\.168\\.\\d{1,3}\\.\\d{1,3}:(${lanPorts})$`).test(
          normalizedOrigin,
        );

      // Verifica se a origem está na lista de permitidas
      const isAllowed =
        isLanDevOrigin ||
        normalizedOrigins.includes(normalizedOrigin) ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes(normalizedOrigin);
      
      if (isAllowed) {
        // Log CORS só se DEBUG_CORS=true (evita flood no terminal em dev)
        if (process.env.DEBUG_CORS === 'true') {
          console.log(`[CORS] Allowed origin: ${origin}`);
        }
        // Retorna a origem exata da requisição para o header CORS
        // Isso garante que o header access-control-allow-origin seja a origem correta
        callback(null, origin);
      } else {
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
  })
);

// 🔹 Correlation ID middleware (deve ser um dos primeiros)
app.use(correlationIdMiddleware);

// 🔹 Sanitização de inputs (proteção contra XSS)
// Aplicar em rotas que recebem dados do usuário
// Nota: Não aplicar em rotas de upload de arquivos (multer precisa do body raw)

// 🔹 Limites de payload por tipo de endpoint
// Limite padrão menor para segurança (10MB)
const defaultLimit = process.env.PAYLOAD_LIMIT_DEFAULT || '10mb';

// Limite maior apenas para endpoints de upload
app.use(express.json({ limit: defaultLimit }));
app.use(express.urlencoded({ limit: defaultLimit, extended: true }));

// Middleware para aumentar limite em rotas específicas de upload
app.use('/vets/upload-crmv', express.json({ limit: '5mb' }));
app.use('/freelancers/upload-certification', express.json({ limit: '5mb' }));
app.use('/marketplace/upload-images', express.json({ limit: '10mb' }));

// 🔹 Rate limiting global (aplicado a todas as rotas)
app.use(generalLimiter);

// 🔹 Rotas principais
app.use('/auth', authRoutes);
app.use('/pets', petRoutes);
app.use('/clinics', clinicsRoutes);
app.use('/vets', vetsRoutes);
app.use('/freelancers', freelancersRoutes);
app.use('/demands', demandsRoutes);
app.use('/applications', applicationsRoutes);
app.use('/specialties', specialtiesRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/marketplace/messages', marketplaceMessagesRoutes);
app.use('/units', unitsRoutes);
app.use('/clinic-users', clinicUsersRoutes);
app.use('/statistics', statisticsRoutes);
app.use('/demand-positions', demandPositionsRoutes);
app.use('/admin', adminRoutes);
app.use('/support', supportTicketsRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/messages/admin', messageReportsRoutes);
app.use('/api', demandInvitesRoutes);
app.use('/api', workProofRoutes);
app.use('/api/hub', hubRoutes);
app.use('/api/public', publicQuotesRoutes);
app.use('/api/public', publicComandasRoutes);
app.use('/health', healthRoutes);

// 🔹 Healthcheck melhorado (verifica dependências)
app.get('/', async (req, res) => {
  try {
    // Verificar conexão com Supabase
    const { error: supabaseError } = await supabase.from('clinics').select('id').limit(1);
    
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
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Erro ao verificar saúde do sistema',
      timestamp: new Date().toISOString(),
    });
  }
});

// 🔹 Endpoint de teste de conexão com Supabase
app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('test').select('*');
  if (error) return res.status(400).json({ error });
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
  } catch (error) {
    // Swagger não é crítico, apenas log se falhar
    console.warn('Swagger não disponível:', error);
  }
}

// ❌ Fallback para rotas inexistentes
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// 🔹 Middleware de tratamento de erros global (deve ser o último)
app.use(errorHandler);

export default app;
