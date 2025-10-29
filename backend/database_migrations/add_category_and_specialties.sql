-- Migration: Add category and specialties table
-- Date: 2025-10-28
-- Description: Adds category field to demands table and creates specialties lookup table

-- Step 1: Add category column to demands table
ALTER TABLE demands 
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'vet' 
CHECK (category IN ('vet', 'freelancer', 'clinic', 'other'));

-- Step 2: Create specialties lookup table
CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('vet', 'freelancer', 'clinic', 'other')),
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Step 3: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_specialties_category ON specialties(category);
CREATE INDEX IF NOT EXISTS idx_demands_category ON demands(category);

-- Step 4: Insert common veterinary specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Cirurgia', 'vet', 'Procedimentos cirúrgicos gerais e especializados'),
  ('Clínica Geral', 'vet', 'Consultas e atendimentos clínicos gerais'),
  ('Dermatologia', 'vet', 'Doenças de pele e pelagem'),
  ('Cardiologia', 'vet', 'Doenças cardíacas e circulatórias'),
  ('Ortopedia', 'vet', 'Problemas ósseos e articulares'),
  ('Oftalmologia', 'vet', 'Doenças oculares'),
  ('Oncologia', 'vet', 'Tratamento de câncer'),
  ('Emergência', 'vet', 'Atendimento emergencial 24h'),
  ('Anestesiologia', 'vet', 'Anestesia para procedimentos'),
  ('Diagnóstico por Imagem', 'vet', 'Raio-X, ultrassom, etc.'),
  ('Neurologia', 'vet', 'Doenças neurológicas'),
  ('Odontologia', 'vet', 'Saúde dental e bucal'),
  ('Medicina Felina', 'vet', 'Especialização em gatos'),
  ('Medicina de Animais Silvestres', 'vet', 'Atendimento a animais exóticos'),
  ('Nutrição', 'vet', 'Orientação nutricional')
ON CONFLICT (name) DO NOTHING;

-- Step 5: Insert freelancer specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Grooming', 'freelancer', 'Banho, tosa e estética pet'),
  ('Adestramento', 'freelancer', 'Treinamento e educação canina'),
  ('Passeador', 'freelancer', 'Passeios e exercícios para pets'),
  ('Cuidador', 'freelancer', 'Cuidados diários com animais'),
  ('Pet Sitter', 'freelancer', 'Hospedagem e cuidado temporário'),
  ('Fotografia Pet', 'freelancer', 'Fotografia profissional de animais'),
  ('Transporte Pet', 'freelancer', 'Transporte seguro de animais'),
  ('Fisioterapia', 'freelancer', 'Fisioterapia e reabilitação animal')
ON CONFLICT (name) DO NOTHING;

-- Step 6: Insert clinic specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Clínica Geral', 'clinic', 'Serviços clínicos gerais'),
  ('Hospital Veterinário', 'clinic', 'Hospital completo com internação'),
  ('Centro Cirúrgico', 'clinic', 'Estrutura para cirurgias'),
  ('Laboratório', 'clinic', 'Exames laboratoriais')
ON CONFLICT (name) DO NOTHING;

-- Step 7: Insert other specialties
INSERT INTO specialties (name, category, description) VALUES
  ('Consultoria', 'other', 'Consultoria veterinária'),
  ('Pesquisa', 'other', 'Pesquisa e desenvolvimento'),
  ('Educação', 'other', 'Ensino e treinamento profissional')
ON CONFLICT (name) DO NOTHING;

-- Verification queries (run these to check if migration was successful)
-- SELECT * FROM specialties ORDER BY category, name;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'demands' AND column_name = 'category';

