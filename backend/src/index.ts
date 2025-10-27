import express from 'express';
import cors from 'cors';
import petRoutes from './routes/pets';
import { supabase } from './config/supabase';
import clinicsRoutes from './routes/clinics';
import vetsRoutes from './routes/vets';
import demandsRoutes from './routes/demands';
import applicationsRoutes from './routes/applications';

const app = express();
app.use(cors());
app.use(express.json());

// Rotas
app.use('/pets', petRoutes);
app.use('/clinics', clinicsRoutes);
app.use('/vets', vetsRoutes);
app.use('/demands', demandsRoutes);
app.use('/applications', applicationsRoutes);

app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.from('test').select('*');
  if (error) return res.status(400).json({ error });
  res.json({ data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🐾 Server running on port ${PORT}`));