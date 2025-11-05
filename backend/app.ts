// backend/app.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import clinicsRoutes from './src/routes/clinics';
import adminRoutes from './src/routes/adminRoutes';
import vetsRoutes from './src/routes/vets';

dotenv.config();

const app = express();

// 🔓 Configurações básicas
app.use(cors({ origin: 'http://localhost:3002', credentials: true }));
app.use(express.json());

// 🚀 Rotas principais
app.use('/clinics', clinicsRoutes);
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
