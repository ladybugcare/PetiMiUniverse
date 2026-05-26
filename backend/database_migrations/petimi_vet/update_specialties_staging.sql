-- ========================================
-- Script: Atualizar tabela specialties no staging
-- Date: 2025-01-XX
-- Description: Atualiza estrutura e dados da tabela specialties no staging
--              para ficar igual ao ambiente local
-- ========================================

-- ========================================
-- 1. GARANTIR ESTRUTURA DA TABELA
-- ========================================

-- Criar tabela se não existir
CREATE TABLE IF NOT EXISTS specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Adicionar coluna active se não existir
ALTER TABLE specialties
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Adicionar coluna role se não existir
ALTER TABLE specialties
ADD COLUMN IF NOT EXISTS role text;

-- ========================================
-- 2. ATUALIZAR CONSTRAINTS
-- ========================================

-- Remover constraints antigas de category
DO $$
DECLARE
    constraint_record RECORD;
    constraint_def text;
BEGIN
    FOR constraint_record IN
        SELECT conname, pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint
        WHERE conrelid = 'specialties'::regclass
          AND contype = 'c'
    LOOP
        constraint_def := constraint_record.constraint_def;
        IF constraint_def LIKE '%category%' OR constraint_def LIKE '%Category%' THEN
            EXECUTE format('ALTER TABLE specialties DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        END IF;
    END LOOP;
    
    ALTER TABLE specialties DROP CONSTRAINT IF EXISTS specialties_category_check;
    ALTER TABLE specialties DROP CONSTRAINT IF EXISTS specialties_category_check1;
END $$;

-- Adicionar nova constraint de category
ALTER TABLE specialties
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

-- Remover e recriar constraint de role
ALTER TABLE specialties
DROP CONSTRAINT IF EXISTS specialties_role_check;

ALTER TABLE specialties
ADD CONSTRAINT specialties_role_check 
CHECK (role IN ('vet', 'freelancer', 'clinic', 'other'));

-- Tornar role NOT NULL e adicionar default
ALTER TABLE specialties
ALTER COLUMN role SET DEFAULT 'vet';

-- Atualizar role para registros existentes se NULL
UPDATE specialties 
SET role = CASE 
  WHEN LOWER(TRIM(category)) IN ('freelancer', 'estética', 'estetica') 
    THEN 'freelancer'
  ELSE 'vet'
END
WHERE role IS NULL;

-- Tornar role NOT NULL após popular
DO $$
BEGIN
    ALTER TABLE specialties ALTER COLUMN role SET NOT NULL;
EXCEPTION
    WHEN others THEN
        -- Se já for NOT NULL, ignora o erro
        NULL;
END $$;

-- ========================================
-- 3. CRIAR ÍNDICES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_specialties_category ON specialties(category);
CREATE INDEX IF NOT EXISTS idx_specialties_active ON specialties(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_specialties_role ON specialties(role);

-- ========================================
-- 4. LIMPAR DADOS EXISTENTES (OPCIONAL)
-- ========================================
-- Descomente a linha abaixo se quiser limpar todos os dados antes de inserir
-- TRUNCATE TABLE specialties CASCADE;

-- ========================================
-- 5. INSERIR TODOS OS DADOS
-- ========================================

INSERT INTO specialties (name, category, description, active, role) VALUES
-- 🩺 Clínicas
('Clínica Geral', 'Clínica', 'Atendimento clínico de rotina e prevenção de doenças', TRUE, 'vet'),
('Clínica de Felinos', 'Clínica', 'Atendimento especializado em felinos domésticos', TRUE, 'vet'),
('Clínica de Grandes Animais', 'Clínica', 'Atendimento clínico de equinos e bovinos', TRUE, 'vet'),
('Clínica de Silvestres e Exóticos', 'Clínica', 'Atendimento a aves, roedores e espécies não convencionais', TRUE, 'vet'),

-- 🔪 Cirúrgicas
('Cirurgia Geral', 'Cirúrgica', 'Procedimentos cirúrgicos diversos', TRUE, 'vet'),
('Cirurgia de Tecidos Moles', 'Cirúrgica', 'Cirurgias de pele, musculatura e órgãos internos', TRUE, 'vet'),
('Cirurgia Ortopédica', 'Cirúrgica', 'Tratamento cirúrgico de ossos e articulações', TRUE, 'vet'),
('Cirurgia Oftálmica', 'Cirúrgica', 'Cirurgias de olhos e anexos', TRUE, 'vet'),
('Anestesiologia Veterinária', 'Cirúrgica', 'Aplicação de anestesias e controle da dor', TRUE, 'vet'),

-- ❤️ Diagnóstico e Complementares
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

-- 🧘‍♀️ Reabilitação e Bem-Estar
('Fisioterapia Animal', 'Reabilitação', 'Tratamentos pós-cirúrgicos e recuperação muscular', TRUE, 'vet'),
('Acupuntura Veterinária', 'Reabilitação', 'Terapia integrativa por pontos energéticos', TRUE, 'vet'),
('Ozonioterapia', 'Reabilitação', 'Tratamento complementar com ozônio medicinal', TRUE, 'vet'),
('Hidroterapia', 'Reabilitação', 'Exercícios em piscina terapêutica', TRUE, 'vet'),
('Quiropraxia Animal', 'Reabilitação', 'Ajustes de coluna e postura', TRUE, 'vet'),
('Terapias Complementares', 'Reabilitação', 'Laserterapia, magnetoterapia e reiki', TRUE, 'vet'),
('Nutrição Veterinária', 'Reabilitação', 'Planejamento nutricional e dietas terapêuticas', TRUE, 'vet'),

-- 🧠 Comportamento e Educação
('Comportamento Animal', 'Comportamental', 'Avaliação e tratamento de distúrbios comportamentais', TRUE, 'vet'),
('Adestramento', 'Comportamental', 'Treinamento e educação de cães e gatos', TRUE, 'vet'),
('Psicologia Animal', 'Comportamental', 'Estudo e manejo de comportamento animal', TRUE, 'vet'),

-- 🐶 Estética e Cuidados
('Banho e Tosa', 'Estética', 'Serviços de higiene e estética pet', TRUE, 'freelancer'),
('Tosa Higiênica', 'Estética', 'Manutenção de higiene e conforto', TRUE, 'freelancer'),
('Banho Terapêutico', 'Estética', 'Banho com produtos dermatológicos e terapêuticos', TRUE, 'freelancer'),
('Estética Animal', 'Estética', 'Cuidados de grooming e aparências especiais', TRUE, 'freelancer'),

-- 🚨 Urgência e Emergência
('Atendimento de Urgência', 'Emergência', 'Casos clínicos urgentes e imprevistos', TRUE, 'vet'),
('Atendimento de Emergência', 'Emergência', 'Atendimento em situações críticas', TRUE, 'vet'),
('Plantonista Veterinário', 'Emergência', 'Profissional de plantão 24h', TRUE, 'vet'),

-- 👩‍⚕️ Reprodução e Neonatal
('Reprodução Animal', 'Reprodução', 'Controle e manejo reprodutivo', TRUE, 'vet'),
('Ginecologia Veterinária', 'Reprodução', 'Saúde reprodutiva das fêmeas', TRUE, 'vet'),
('Andrologia', 'Reprodução', 'Saúde reprodutiva dos machos', TRUE, 'vet'),
('Inseminação Artificial', 'Reprodução', 'Técnicas de fertilização assistida', TRUE, 'vet'),
('Neonatologia', 'Reprodução', 'Cuidados com recém-nascidos e ninhadas', TRUE, 'vet'),

-- 🐄 Campo e Produção
('Medicina de Grandes Animais', 'Campo', 'Atendimento a equinos e bovinos', TRUE, 'vet'),
('Medicina de Produção Animal', 'Campo', 'Saúde e produtividade de rebanhos', TRUE, 'vet'),
('Inspeção de Produtos de Origem Animal', 'Campo', 'Controle sanitário e qualidade de alimentos', TRUE, 'vet'),

-- 💼 Freelancers e Parceiros
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

-- ========================================
-- 6. ADICIONAR COMENTÁRIOS
-- ========================================

COMMENT ON COLUMN specialties.active IS 'Indica se a especialidade está ativa e disponível para seleção';
COMMENT ON COLUMN specialties.role IS 'Tipo de profissional: vet (veterinário), freelancer, clinic, other';

-- ========================================
-- 7. VERIFICAÇÃO
-- ========================================

SELECT 'Tabela specialties atualizada com sucesso!' as status;

-- Verificar quantas especialidades foram inseridas por categoria
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE active = true) as ativas,
  COUNT(*) FILTER (WHERE active = false) as inativas
FROM specialties
GROUP BY category
ORDER BY category;

-- Verificar por role
SELECT 
  role,
  COUNT(*) as total,
  STRING_AGG(DISTINCT category, ', ') as categorias
FROM specialties
GROUP BY role
ORDER BY role;

