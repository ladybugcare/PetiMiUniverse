-- ========================================
-- Migration: Adicionar Especialidades Veterinárias Completas
-- Date: 2025-01-30
-- Description: Adiciona coluna active e insere todas as especialidades veterinárias
-- ========================================

-- Adicionar coluna active se não existir
ALTER TABLE specialties
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Atualizar constraint de category para incluir novas categorias
-- Primeiro, remover TODAS as constraints de category (pode ter nomes diferentes)
DO $$
DECLARE
    constraint_record RECORD;
    constraint_def text;
BEGIN
    -- Buscar todas as check constraints na tabela specialties
    FOR constraint_record IN
        SELECT conname, pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint
        WHERE conrelid = 'specialties'::regclass
          AND contype = 'c'
    LOOP
        constraint_def := constraint_record.constraint_def;
        -- Verificar se a constraint está relacionada a category
        IF constraint_def LIKE '%category%' OR constraint_def LIKE '%Category%' THEN
            EXECUTE format('ALTER TABLE specialties DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
            RAISE NOTICE 'Constraint removida: % (def: %)', constraint_record.conname, constraint_def;
        END IF;
    END LOOP;
    
    -- Também tentar remover com nomes comuns
    ALTER TABLE specialties DROP CONSTRAINT IF EXISTS specialties_category_check;
    ALTER TABLE specialties DROP CONSTRAINT IF EXISTS specialties_category_check1;
END $$;

-- Adicionar nova constraint com todas as categorias (incluindo 'Freelancer' com F maiúsculo)
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

-- ========================================
-- 🐾 PETIVET: Especialidades Veterinárias
-- ========================================

INSERT INTO specialties (name, category, description, active) VALUES
-- 🩺 Clínicas
('Clínica Geral', 'Clínica', 'Atendimento clínico de rotina e prevenção de doenças', TRUE),
('Clínica de Felinos', 'Clínica', 'Atendimento especializado em felinos domésticos', TRUE),
('Clínica de Grandes Animais', 'Clínica', 'Atendimento clínico de equinos e bovinos', TRUE),
('Clínica de Silvestres e Exóticos', 'Clínica', 'Atendimento a aves, roedores e espécies não convencionais', TRUE),

-- 🔪 Cirúrgicas
('Cirurgia Geral', 'Cirúrgica', 'Procedimentos cirúrgicos diversos', TRUE),
('Cirurgia de Tecidos Moles', 'Cirúrgica', 'Cirurgias de pele, musculatura e órgãos internos', TRUE),
('Cirurgia Ortopédica', 'Cirúrgica', 'Tratamento cirúrgico de ossos e articulações', TRUE),
('Cirurgia Oftálmica', 'Cirúrgica', 'Cirurgias de olhos e anexos', TRUE),
('Anestesiologia Veterinária', 'Cirúrgica', 'Aplicação de anestesias e controle da dor', TRUE),

-- ❤️ Diagnóstico e Complementares
('Diagnóstico por Imagem', 'Diagnóstico', 'Exames de imagem veterinários (Raio-X, USG, etc.)', TRUE),
('Ultrassonografia', 'Diagnóstico', 'Exame de imagem por ultrassom', TRUE),
('Patologia Clínica', 'Diagnóstico', 'Análises laboratoriais e citologia', TRUE),
('Cardiologia', 'Diagnóstico', 'Avaliação cardíaca e eletrocardiogramas', TRUE),
('Dermatologia', 'Diagnóstico', 'Diagnóstico e tratamento de doenças de pele', TRUE),
('Oncologia', 'Diagnóstico', 'Diagnóstico e tratamento de tumores e cânceres', TRUE),
('Endocrinologia', 'Diagnóstico', 'Distúrbios hormonais e metabólicos', TRUE),
('Neurologia', 'Diagnóstico', 'Doenças neurológicas e distúrbios motores', TRUE),
('Odontologia Veterinária', 'Diagnóstico', 'Saúde bucal e procedimentos dentários', TRUE),
('Oftalmologia Veterinária', 'Diagnóstico', 'Doenças oculares e visão', TRUE),

-- 🧘‍♀️ Reabilitação e Bem-Estar
('Fisioterapia Animal', 'Reabilitação', 'Tratamentos pós-cirúrgicos e recuperação muscular', TRUE),
('Acupuntura Veterinária', 'Reabilitação', 'Terapia integrativa por pontos energéticos', TRUE),
('Ozonioterapia', 'Reabilitação', 'Tratamento complementar com ozônio medicinal', TRUE),
('Hidroterapia', 'Reabilitação', 'Exercícios em piscina terapêutica', TRUE),
('Quiropraxia Animal', 'Reabilitação', 'Ajustes de coluna e postura', TRUE),
('Terapias Complementares', 'Reabilitação', 'Laserterapia, magnetoterapia e reiki', TRUE),
('Nutrição Veterinária', 'Reabilitação', 'Planejamento nutricional e dietas terapêuticas', TRUE),

-- 🧠 Comportamento e Educação
('Comportamento Animal', 'Comportamental', 'Avaliação e tratamento de distúrbios comportamentais', TRUE),
('Adestramento', 'Comportamental', 'Treinamento e educação de cães e gatos', TRUE),
('Psicologia Animal', 'Comportamental', 'Estudo e manejo de comportamento animal', TRUE),

-- 🐶 Estética e Cuidados
('Banho e Tosa', 'Estética', 'Serviços de higiene e estética pet', TRUE),
('Tosa Higiênica', 'Estética', 'Manutenção de higiene e conforto', TRUE),
('Banho Terapêutico', 'Estética', 'Banho com produtos dermatológicos e terapêuticos', TRUE),
('Estética Animal', 'Estética', 'Cuidados de grooming e aparências especiais', TRUE),

-- 🚨 Urgência e Emergência
('Atendimento de Urgência', 'Emergência', 'Casos clínicos urgentes e imprevistos', TRUE),
('Atendimento de Emergência', 'Emergência', 'Atendimento em situações críticas', TRUE),
('Plantonista Veterinário', 'Emergência', 'Profissional de plantão 24h', TRUE),

-- 👩‍⚕️ Reprodução e Neonatal
('Reprodução Animal', 'Reprodução', 'Controle e manejo reprodutivo', TRUE),
('Ginecologia Veterinária', 'Reprodução', 'Saúde reprodutiva das fêmeas', TRUE),
('Andrologia', 'Reprodução', 'Saúde reprodutiva dos machos', TRUE),
('Inseminação Artificial', 'Reprodução', 'Técnicas de fertilização assistida', TRUE),
('Neonatologia', 'Reprodução', 'Cuidados com recém-nascidos e ninhadas', TRUE),

-- 🐄 Campo e Produção
('Medicina de Grandes Animais', 'Campo', 'Atendimento a equinos e bovinos', TRUE),
('Medicina de Produção Animal', 'Campo', 'Saúde e produtividade de rebanhos', TRUE),
('Inspeção de Produtos de Origem Animal', 'Campo', 'Controle sanitário e qualidade de alimentos', TRUE),

-- 💼 Freelancers e Parceiros
('Auxiliar Veterinário', 'Freelancer', 'Apoio a veterinários e clínicas', TRUE),
('Técnico em Veterinária', 'Freelancer', 'Procedimentos técnicos e laboratoriais', TRUE),
('Tosador Profissional', 'Freelancer', 'Especialista em tosa e estética animal', TRUE),
('Dog Walker', 'Freelancer', 'Serviço de passeio e socialização de pets', TRUE),
('Pet Sitter', 'Freelancer', 'Cuidados domiciliares com pets', TRUE),
('Motorista Pet', 'Freelancer', 'Transporte seguro de animais', TRUE),
('Fotógrafo Pet', 'Freelancer', 'Ensaio fotográfico profissional de pets', TRUE)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- Criar índice para coluna active
CREATE INDEX IF NOT EXISTS idx_specialties_active ON specialties(active) WHERE active = true;

-- Comentário na coluna active
COMMENT ON COLUMN specialties.active IS 'Indica se a especialidade está ativa e disponível para seleção';

-- Verificação
SELECT 'Migration add_vet_specialties_complete.sql concluída com sucesso!' as status;

-- Verificar quantas especialidades foram inseridas por categoria
SELECT 
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE active = true) as ativas,
  COUNT(*) FILTER (WHERE active = false) as inativas
FROM specialties
GROUP BY category
ORDER BY category;

