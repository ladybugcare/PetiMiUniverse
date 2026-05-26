-- ========================================
-- Script: Comparar tabela specialties entre Local e Staging
-- Date: 2025-01-XX
-- Description: Verifica estrutura e dados da tabela specialties
--              e mostra o que falta em relação ao esperado
-- ========================================

-- ========================================
-- 1. VERIFICAR ESTRUTURA DA TABELA
-- ========================================

SELECT 
    '📋 ESTRUTURA DA TABELA' as secao,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'specialties'
ORDER BY ordinal_position;

-- ========================================
-- 2. VERIFICAR COLUNAS ESPERADAS
-- ========================================

SELECT 
    '✅ COLUNAS ESPERADAS' as secao,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'id') 
        THEN '✅ id' ELSE '❌ id FALTANDO' 
    END as id,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'name') 
        THEN '✅ name' ELSE '❌ name FALTANDO' 
    END as name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'category') 
        THEN '✅ category' ELSE '❌ category FALTANDO' 
    END as category,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'description') 
        THEN '✅ description' ELSE '❌ description FALTANDO' 
    END as description,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'created_at') 
        THEN '✅ created_at' ELSE '❌ created_at FALTANDO' 
    END as created_at,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'active') 
        THEN '✅ active' ELSE '❌ active FALTANDO' 
    END as active,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'role') 
        THEN '✅ role' ELSE '❌ role FALTANDO' 
    END as role;

-- ========================================
-- 3. CONTAGEM GERAL
-- ========================================

SELECT 
    '📊 RESUMO GERAL' as secao,
    COUNT(*) as total_especialidades,
    COUNT(*) FILTER (WHERE active = true) as ativas,
    COUNT(*) FILTER (WHERE active = false) as inativas,
    COUNT(DISTINCT category) as total_categorias,
    COUNT(DISTINCT role) as total_roles
FROM specialties;

-- ========================================
-- 4. ESPECIALIDADES ESPERADAS (LISTA COMPLETA)
-- ========================================

WITH expected_specialties AS (
    SELECT name, category, description, active, role FROM (VALUES
        -- Clínicas
        ('Clínica Geral', 'Clínica', 'Atendimento clínico de rotina e prevenção de doenças', TRUE, 'vet'),
        ('Clínica de Felinos', 'Clínica', 'Atendimento especializado em felinos domésticos', TRUE, 'vet'),
        ('Clínica de Grandes Animais', 'Clínica', 'Atendimento clínico de equinos e bovinos', TRUE, 'vet'),
        ('Clínica de Silvestres e Exóticos', 'Clínica', 'Atendimento a aves, roedores e espécies não convencionais', TRUE, 'vet'),
        
        -- Cirúrgicas
        ('Cirurgia Geral', 'Cirúrgica', 'Procedimentos cirúrgicos diversos', TRUE, 'vet'),
        ('Cirurgia de Tecidos Moles', 'Cirúrgica', 'Cirurgias de pele, musculatura e órgãos internos', TRUE, 'vet'),
        ('Cirurgia Ortopédica', 'Cirúrgica', 'Tratamento cirúrgico de ossos e articulações', TRUE, 'vet'),
        ('Cirurgia Oftálmica', 'Cirúrgica', 'Cirurgias de olhos e anexos', TRUE, 'vet'),
        ('Anestesiologia Veterinária', 'Cirúrgica', 'Aplicação de anestesias e controle da dor', TRUE, 'vet'),
        
        -- Diagnóstico
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
        
        -- Reabilitação
        ('Fisioterapia Animal', 'Reabilitação', 'Tratamentos pós-cirúrgicos e recuperação muscular', TRUE, 'vet'),
        ('Acupuntura Veterinária', 'Reabilitação', 'Terapia integrativa por pontos energéticos', TRUE, 'vet'),
        ('Ozonioterapia', 'Reabilitação', 'Tratamento complementar com ozônio medicinal', TRUE, 'vet'),
        ('Hidroterapia', 'Reabilitação', 'Exercícios em piscina terapêutica', TRUE, 'vet'),
        ('Quiropraxia Animal', 'Reabilitação', 'Ajustes de coluna e postura', TRUE, 'vet'),
        ('Terapias Complementares', 'Reabilitação', 'Laserterapia, magnetoterapia e reiki', TRUE, 'vet'),
        ('Nutrição Veterinária', 'Reabilitação', 'Planejamento nutricional e dietas terapêuticas', TRUE, 'vet'),
        
        -- Comportamental
        ('Comportamento Animal', 'Comportamental', 'Avaliação e tratamento de distúrbios comportamentais', TRUE, 'vet'),
        ('Adestramento', 'Comportamental', 'Treinamento e educação de cães e gatos', TRUE, 'vet'),
        ('Psicologia Animal', 'Comportamental', 'Estudo e manejo de comportamento animal', TRUE, 'vet'),
        
        -- Estética
        ('Banho e Tosa', 'Estética', 'Serviços de higiene e estética pet', TRUE, 'freelancer'),
        ('Tosa Higiênica', 'Estética', 'Manutenção de higiene e conforto', TRUE, 'freelancer'),
        ('Banho Terapêutico', 'Estética', 'Banho com produtos dermatológicos e terapêuticos', TRUE, 'freelancer'),
        ('Estética Animal', 'Estética', 'Cuidados de grooming e aparências especiais', TRUE, 'freelancer'),
        
        -- Emergência
        ('Atendimento de Urgência', 'Emergência', 'Casos clínicos urgentes e imprevistos', TRUE, 'vet'),
        ('Atendimento de Emergência', 'Emergência', 'Atendimento em situações críticas', TRUE, 'vet'),
        ('Plantonista Veterinário', 'Emergência', 'Profissional de plantão 24h', TRUE, 'vet'),
        
        -- Reprodução
        ('Reprodução Animal', 'Reprodução', 'Controle e manejo reprodutivo', TRUE, 'vet'),
        ('Ginecologia Veterinária', 'Reprodução', 'Saúde reprodutiva das fêmeas', TRUE, 'vet'),
        ('Andrologia', 'Reprodução', 'Saúde reprodutiva dos machos', TRUE, 'vet'),
        ('Inseminação Artificial', 'Reprodução', 'Técnicas de fertilização assistida', TRUE, 'vet'),
        ('Neonatologia', 'Reprodução', 'Cuidados com recém-nascidos e ninhadas', TRUE, 'vet'),
        
        -- Campo
        ('Medicina de Grandes Animais', 'Campo', 'Atendimento a equinos e bovinos', TRUE, 'vet'),
        ('Medicina de Produção Animal', 'Campo', 'Saúde e produtividade de rebanhos', TRUE, 'vet'),
        ('Inspeção de Produtos de Origem Animal', 'Campo', 'Controle sanitário e qualidade de alimentos', TRUE, 'vet'),
        
        -- Freelancer
        ('Auxiliar Veterinário', 'Freelancer', 'Apoio a veterinários e clínicas', TRUE, 'freelancer'),
        ('Técnico em Veterinária', 'Freelancer', 'Procedimentos técnicos e laboratoriais', TRUE, 'freelancer'),
        ('Tosador Profissional', 'Freelancer', 'Especialista em tosa e estética animal', TRUE, 'freelancer'),
        ('Dog Walker', 'Freelancer', 'Serviço de passeio e socialização de pets', TRUE, 'freelancer'),
        ('Pet Sitter', 'Freelancer', 'Cuidados domiciliares com pets', TRUE, 'freelancer'),
        ('Motorista Pet', 'Freelancer', 'Transporte seguro de animais', TRUE, 'freelancer'),
        ('Fotógrafo Pet', 'Freelancer', 'Ensaio fotográfico profissional de pets', TRUE, 'freelancer')
    ) AS t(name, category, description, active, role)
)
SELECT 
    '❌ ESPECIALIDADES FALTANDO' as secao,
    e.name,
    e.category,
    e.role,
    'FALTANDO' as status
FROM expected_specialties e
LEFT JOIN specialties s ON s.name = e.name
WHERE s.name IS NULL
ORDER BY e.category, e.name;

-- ========================================
-- 5. ESPECIALIDADES QUE EXISTEM MAS ESTÃO DESATUALIZADAS
-- ========================================

WITH expected_specialties AS (
    SELECT name, category, description, active, role FROM (VALUES
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
    ) AS t(name, category, description, active, role)
)
SELECT 
    '⚠️ ESPECIALIDADES DESATUALIZADAS' as secao,
    s.name,
    s.category as categoria_atual,
    e.category as categoria_esperada,
    s.role as role_atual,
    e.role as role_esperado,
    CASE 
        WHEN s.category != e.category THEN 'Category diferente'
        WHEN s.role != e.role THEN 'Role diferente'
        WHEN s.description != e.description THEN 'Description diferente'
        WHEN s.active != e.active THEN 'Active diferente'
        ELSE 'OK'
    END as diferenca
FROM specialties s
INNER JOIN expected_specialties e ON s.name = e.name
WHERE s.category != e.category 
   OR s.role != e.role 
   OR s.description != e.description 
   OR s.active != e.active
ORDER BY s.name;

-- ========================================
-- 6. ESPECIALIDADES EXTRA (que existem mas não deveriam)
-- ========================================

WITH expected_specialties AS (
    SELECT name FROM (VALUES
        ('Clínica Geral'), ('Clínica de Felinos'), ('Clínica de Grandes Animais'), ('Clínica de Silvestres e Exóticos'),
        ('Cirurgia Geral'), ('Cirurgia de Tecidos Moles'), ('Cirurgia Ortopédica'), ('Cirurgia Oftálmica'), ('Anestesiologia Veterinária'),
        ('Diagnóstico por Imagem'), ('Ultrassonografia'), ('Patologia Clínica'), ('Cardiologia'), ('Dermatologia'),
        ('Oncologia'), ('Endocrinologia'), ('Neurologia'), ('Odontologia Veterinária'), ('Oftalmologia Veterinária'),
        ('Fisioterapia Animal'), ('Acupuntura Veterinária'), ('Ozonioterapia'), ('Hidroterapia'), ('Quiropraxia Animal'),
        ('Terapias Complementares'), ('Nutrição Veterinária'),
        ('Comportamento Animal'), ('Adestramento'), ('Psicologia Animal'),
        ('Banho e Tosa'), ('Tosa Higiênica'), ('Banho Terapêutico'), ('Estética Animal'),
        ('Atendimento de Urgência'), ('Atendimento de Emergência'), ('Plantonista Veterinário'),
        ('Reprodução Animal'), ('Ginecologia Veterinária'), ('Andrologia'), ('Inseminação Artificial'), ('Neonatologia'),
        ('Medicina de Grandes Animais'), ('Medicina de Produção Animal'), ('Inspeção de Produtos de Origem Animal'),
        ('Auxiliar Veterinário'), ('Técnico em Veterinária'), ('Tosador Profissional'), ('Dog Walker'),
        ('Pet Sitter'), ('Motorista Pet'), ('Fotógrafo Pet')
    ) AS t(name)
)
SELECT 
    '🔍 ESPECIALIDADES EXTRA (não esperadas)' as secao,
    s.name,
    s.category,
    s.role,
    s.active
FROM specialties s
LEFT JOIN expected_specialties e ON s.name = e.name
WHERE e.name IS NULL
ORDER BY s.category, s.name;

-- ========================================
-- 7. RESUMO POR CATEGORIA
-- ========================================

SELECT 
    '📊 RESUMO POR CATEGORIA' as secao,
    category,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE active = true) as ativas,
    COUNT(*) FILTER (WHERE active = false) as inativas
FROM specialties
GROUP BY category
ORDER BY category;

-- ========================================
-- 8. RESUMO POR ROLE
-- ========================================

SELECT 
    '📊 RESUMO POR ROLE' as secao,
    COALESCE(role, 'NULL') as role,
    COUNT(*) as total,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category) as categorias
FROM specialties
GROUP BY role
ORDER BY role;

