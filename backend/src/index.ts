import express from 'express';
import cors from 'cors';
import petRoutes from './routes/pets';
import { supabase } from './config/supabase';
import clinicsRoutes from './routes/clinics';
import vetsRoutes from './routes/vets';
import demandsRoutes from './routes/demands';
import applicationsRoutes from './routes/applications';
import authRoutes from './routes/auth';
import specialtiesRoutes from './routes/specialties';
import marketplaceRoutes from './routes/marketplace';
import marketplaceMessagesRoutes from './routes/marketplaceMessages';
import unitsRoutes from './routes/units';
import clinicUsersRoutes from './routes/clinicUsers';
import statisticsRoutes from './routes/statistics';
import demandPositionsRoutes from './routes/demandPositions';
import adminRoutes from './routes/admin';
import supportTicketsRoutes from './routes/supportTickets';
import notificationsRoutes from './routes/notifications';

const app = express();

// CORS configuration for different environments
const allowedOrigins: string[] = [
  'http://localhost:3000',
  'http://localhost:3002', // React dev server
  'https://peti-vet-git-staging-petivet.vercel.app',
  'https://peti-vet-petivet.vercel.app', // Vercel production URL
  process.env.FRONTEND_URL
].filter((origin): origin is string => Boolean(origin));

// Normalize origins (remove trailing slashes for comparison)
const normalizedOrigins = allowedOrigins.map(origin => origin.replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if origin is allowed
    if (normalizedOrigins.includes(normalizedOrigin) || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin} (normalized: ${normalizedOrigin})`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// Increase payload limit to support image uploads (base64 encoded)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rotas
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

// ... rest of the file

app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('test').select('*');
  if (error) return res.status(400).json({ error });
  res.json({ data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🐾 Server running on port ${PORT}`));