// backend/app.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import clinicsRoutes from './routes/clinics';
console.log('✅ Rotas de clínicas carregadas');

import adminRoutes from './routes/adminRoutes';
import vetsRoutes from './routes/vets';

dotenv.config();

const app = express();

// 🔓 Configurações básicas
app.use(cors({ origin: 'http://localhost:3002', credentials: true }));
app.use(express.json());

// 🚀 Rotas principais
app.use('/clinics', clinicsRoutes);
console.log('✅ Rotas /clinics registradas');

app.use('/admin', adminRoutes);
app.use('/vets', vetsRoutes);

// 🩵 Healthcheck
app.get('/', (_req, res) => {
  res.send('PetiVet API is running 🐾');
});

// ❌ Fallback para rotas inexistentes
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

export default app;
