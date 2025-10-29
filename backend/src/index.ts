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

const app = express();
app.use(cors());
app.use(express.json());

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

// ... rest of the file

app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('test').select('*');
  if (error) return res.status(400).json({ error });
  res.json({ data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🐾 Server running on port ${PORT}`));