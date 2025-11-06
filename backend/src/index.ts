// backend/src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';

// 🔹 Importa rotas
import petRoutes from './routes/pets.js';
import clinicsRoutes from './routes/clinics.js';
import vetsRoutes from './routes/vets.js';
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
  'https://peti-vet-git-staging-petivet.vercel.app', // Staging
  'https://peti-vet-petivet.vercel.app', // Vercel production
  process.env.FRONTEND_URL, // Variável de ambiente (permite configuração flexível)
].filter((origin): origin is string => Boolean(origin));

const normalizedOrigins = allowedOrigins.map((origin) =>
  origin.replace(/\/$/, '')
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, '');
      if (
        normalizedOrigins.includes(normalizedOrigin) ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
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

// 🔹 Rotas principais
app.use('/auth', authRoutes);
app.use('/pets', petRoutes);
app.use('/clinics', clinicsRoutes);
app.use('/vets', vetsRoutes);
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

// 🔹 Healthcheck
app.get('/', (req, res) => {
  res.json({ message: '🐾 PetiVet API is running!' });
});

// 🔹 Endpoint de teste de conexão com Supabase
app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('test').select('*');
  if (error) return res.status(400).json({ error });
  res.json({ data });
});

// 🔹 Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🐾 Server running on port ${PORT}`);
});
