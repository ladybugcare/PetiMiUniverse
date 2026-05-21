-- =============================================================================
-- PetiMi / PetMi Vet — Popular tabela public.specialties (lista vazia no app)
-- =============================================================================
-- Execute no Supabase: SQL Editor → colar → Run (como postgres / service role
-- não é necessário; isto é DDL+DML normal na public schema).
--
-- O que faz:
--   1) Garante tabela + colunas (id, name, category, description, active, role)
--   2) Ajusta constraints de category/role para o formato usado pelo backend atual
--   3) Insere/atualiza especialidades (ON CONFLICT por nome)
--
-- Idempotente: pode correr várias vezes.
-- =============================================================================

-- 1) Tabela base
CREATE TABLE IF NOT EXISTS public.specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'vet',
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.specialties
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

ALTER TABLE public.specialties
  ADD COLUMN IF NOT EXISTS role text;

-- Nome único (necessário para ON CONFLICT (name))
CREATE UNIQUE INDEX IF NOT EXISTS specialties_name_key ON public.specialties (name);

-- 2) Remover checks antigos de category que impedem valores como 'Clínica', 'Cirúrgica', …
ALTER TABLE public.specialties DROP CONSTRAINT IF EXISTS specialties_category_check;
ALTER TABLE public.specialties DROP CONSTRAINT IF EXISTS specialties_category_check1;

ALTER TABLE public.specialties
  ADD CONSTRAINT specialties_category_check
  CHECK (category IN (
    'vet',
    'freelancer',
    'Freelancer',
    'clinic',
    'other',
    'Clínica',
    'Cirúrgica',
    'Diagnóstico',
    'Reabilitação',
    'Comportamental',
    'Estética',
    'Emergência',
    'Reprodução',
    'Campo'
  ));

ALTER TABLE public.specialties DROP CONSTRAINT IF EXISTS specialties_role_check;

ALTER TABLE public.specialties
  ADD CONSTRAINT specialties_role_check
  CHECK (role IN ('vet', 'freelancer', 'clinic', 'other'));

ALTER TABLE public.specialties
  ALTER COLUMN role SET DEFAULT 'vet';

-- Preencher role em linhas antigas
UPDATE public.specialties
SET role = CASE
  WHEN LOWER(TRIM(category)) IN ('freelancer', 'estética', 'estetica') THEN 'freelancer'
  WHEN LOWER(TRIM(category)) = 'clinic' THEN 'clinic'
  WHEN LOWER(TRIM(category)) = 'other' THEN 'other'
  ELSE 'vet'
END
WHERE role IS NULL;

-- Garantir NOT NULL em role (falha se ainda houver NULL — corrija dados manualmente)
ALTER TABLE public.specialties
  ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_specialties_category ON public.specialties (category);
CREATE INDEX IF NOT EXISTS idx_specialties_role ON public.specialties (role);
CREATE INDEX IF NOT EXISTS idx_specialties_active ON public.specialties (active) WHERE active = true;

COMMENT ON COLUMN public.specialties.active IS 'Indica se a especialidade está ativa e disponível para seleção';
COMMENT ON COLUMN public.specialties.role IS 'Tipo de profissional: vet, freelancer, clinic, other (filtro da API /specialties)';

-- 3) Dados (mesmo conjunto que update_specialties_staging.sql)
INSERT INTO public.specialties (name, category, description, active, role) VALUES
('Clínica Geral', 'Clínica', 'Atendimento clínico de rotina e prevenção de doenças', TRUE, 'vet'),
('Clínica de Felinos', 'Clínica', 'Atendimento especializado em felinos domésticos', TRUE, 'vet'),
('Clínica de Grandes Animais', 'Clínica', 'Atendimento clínico de equinos e bovinos', TRUE, 'vet'),
('Clínica de Silvestres e Exóticos', 'Clínica', 'Atendimento a aves, roedores e espécies não convencionais', TRUE, 'vet'),
('Cirurgia Geral', 'Cirúrgica', 'Procedimentos cirúrgicos diversos', TRUE, 'vet'),
('Cirurgia de Tecidos Moles', 'Cirúrgica', 'Cirurgias de pele, musculatura e órgãos internos', TRUE, 'vet'),
('Cirurgia Ortopédica', 'Cirúrgica', 'Tratamento cirúrgico de ossos e articulações', TRUE, 'vet'),
('Cirurgia Oftálmica', 'Cirúrgica', 'Cirurgias de olhos e anexos', TRUE, 'vet'),
('Anestesiologia Veterinária', 'Cirúrgica', 'Aplicação de anestesias e controle da dor', TRUE, 'vet'),
('Diagnóstico por Imagem', 'Diagnóstico', 'Exames de imagem veterinários (Raio-X, USG, etc.)', TRUE, 'vet'),
('Ultrassonografia', 'Diagnóstico', 'Exame de imagem por ultrassom', TRUE, 'vet'),
('Patologia Clínica', 'Diagnóstico', 'Análises laboratoriais e citologia', TRUE, 'vet'),
('Cardiologia', 'Diagnóstico', 'Avaliação cardíaca e eletrocardiogramas', TRUE, 'vet'),
('Dermatologia', 'Diagnóstico', 'Diagnóstico e tratamento de doenças de pele', TRUE, 'vet'),
('Oncologia', 'Diagnóstico', 'Diagnóstico e tratamento de tumores e cânceres', TRUE, 'vet'),
('Endocrinologia', 'Diagnóstico', 'Distúrbios hormonais e metabólicos', TRUE, 'vet'),
('Neurologia', 'Diagnóstico', 'Doenças neurológicas e distúrbios motores', TRUE, 'vet'),
('Odontologia Veterinária', 'Diagnóstico', 'Saúde bucal e procedimentos dentários', TRUE, 'vet'),
('Oftalmologia Veterinária', 'Diagnóstico', 'Doenças oculares e visão', TRUE, 'vet'),
('Fisioterapia Animal', 'Reabilitação', 'Tratamentos pós-cirúrgicos e recuperação muscular', TRUE, 'vet'),
('Acupuntura Veterinária', 'Reabilitação', 'Terapia integrativa por pontos energéticos', TRUE, 'vet'),
('Ozonioterapia', 'Reabilitação', 'Tratamento complementar com ozônio medicinal', TRUE, 'vet'),
('Hidroterapia', 'Reabilitação', 'Exercícios em piscina terapêutica', TRUE, 'vet'),
('Quiropraxia Animal', 'Reabilitação', 'Ajustes de coluna e postura', TRUE, 'vet'),
('Terapias Complementares', 'Reabilitação', 'Laserterapia, magnetoterapia e reiki', TRUE, 'vet'),
('Nutrição Veterinária', 'Reabilitação', 'Planejamento nutricional e dietas terapêuticas', TRUE, 'vet'),
('Comportamento Animal', 'Comportamental', 'Avaliação e tratamento de distúrbios comportamentais', TRUE, 'vet'),
('Adestramento', 'Comportamental', 'Treinamento e educação de cães e gatos', TRUE, 'vet'),
('Psicologia Animal', 'Comportamental', 'Estudo e manejo de comportamento animal', TRUE, 'vet'),
('Banho e Tosa', 'Estética', 'Serviços de higiene e estética pet', TRUE, 'freelancer'),
('Tosa Higiênica', 'Estética', 'Manutenção de higiene e conforto', TRUE, 'freelancer'),
('Banho Terapêutico', 'Estética', 'Banho com produtos dermatológicos e terapêuticos', TRUE, 'freelancer'),
('Estética Animal', 'Estética', 'Cuidados de grooming e aparências especiais', TRUE, 'freelancer'),
('Atendimento de Urgência', 'Emergência', 'Casos clínicos urgentes e imprevistos', TRUE, 'vet'),
('Atendimento de Emergência', 'Emergência', 'Atendimento em situações críticas', TRUE, 'vet'),
('Plantonista Veterinário', 'Emergência', 'Profissional de plantão 24h', TRUE, 'vet'),
('Reprodução Animal', 'Reprodução', 'Controle e manejo reprodutivo', TRUE, 'vet'),
('Ginecologia Veterinária', 'Reprodução', 'Saúde reprodutiva das fêmeas', TRUE, 'vet'),
('Andrologia', 'Reprodução', 'Saúde reprodutiva dos machos', TRUE, 'vet'),
('Inseminação Artificial', 'Reprodução', 'Técnicas de fertilização assistida', TRUE, 'vet'),
('Neonatologia', 'Reprodução', 'Cuidados com recém-nascidos e ninhadas', TRUE, 'vet'),
('Medicina de Grandes Animais', 'Campo', 'Atendimento a equinos e bovinos', TRUE, 'vet'),
('Medicina de Produção Animal', 'Campo', 'Saúde e produtividade de rebanhos', TRUE, 'vet'),
('Inspeção de Produtos de Origem Animal', 'Campo', 'Controle sanitário e qualidade de alimentos', TRUE, 'vet'),
('Auxiliar Veterinário', 'Freelancer', 'Apoio a veterinários e clínicas', TRUE, 'freelancer'),
('Técnico em Veterinária', 'Freelancer', 'Procedimentos técnicos e laboratoriais', TRUE, 'freelancer'),
('Tosador Profissional', 'Freelancer', 'Especialista em tosa e estética animal', TRUE, 'freelancer'),
('Dog Walker', 'Freelancer', 'Serviço de passeio e socialização de pets', TRUE, 'freelancer'),
('Pet Sitter', 'Freelancer', 'Cuidados domiciliares com pets', TRUE, 'freelancer'),
('Motorista Pet', 'Freelancer', 'Transporte seguro de animais', TRUE, 'freelancer'),
('Fotógrafo Pet', 'Freelancer', 'Ensaio fotográfico profissional de pets', TRUE, 'freelancer')
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  active = EXCLUDED.active,
  role = EXCLUDED.role;

-- 4) Verificação rápida
SELECT role, COUNT(*) AS total
FROM public.specialties
GROUP BY role
ORDER BY role;

SELECT COUNT(*) FILTER (WHERE role = 'vet') AS vets,
       COUNT(*) FILTER (WHERE role = 'freelancer') AS freelancers,
       COUNT(*) AS todas
FROM public.specialties;
