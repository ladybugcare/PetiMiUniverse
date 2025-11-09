// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';

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
import healthRoutes from './routes/health.js';

// 🔹 Carrega variáveis de ambiente
dotenv.config();

// 🔹 Inicializa o Express
const app = express();

// 🔹 Configuração de CORS (com suporte a múltiplos domínios)
// Permite origens locais (portas 3001 e 3002 para React dev server) e ambientes de deploy
const allowedOrigins: string[] = [
  'http://localhost:3000', // Backend local (caso frontend rode na mesma porta)
  'http://localhost:3001', // Frontend local - porta alternativa
  'http://localhost:3002', // Frontend local - porta padrão React dev server
  'https://peti-vet-git-staging-petivet.vercel.app', // Staging (Vercel preview)
  'https://staging.petivet.com.br', // Staging (domínio customizado)
  'https://peti-vet-petivet.vercel.app', // Vercel production (preview)
  'https://petivet.com.br', // Produção (domínio customizado)
  process.env.FRONTEND_URL, // Variável de ambiente (permite configuração flexível)
].filter((origin): origin is string => Boolean(origin));

const normalizedOrigins = allowedOrigins.map((origin) =>
  origin.replace(/\/$/, '')
);

app.use(
  cors({
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
      const isAllowed = 
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

// 🔹 Aumenta limite de payload (para imagens base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use('/health', healthRoutes);

// 🔹 Healthcheck melhorado (verifica dependências)
app.get('/', async (req, res) => {
  try {
    // Verificar conexão com Supabase
    const { error: supabaseError } = await supabase.from('clinics').select('id').limit(1);
    
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
