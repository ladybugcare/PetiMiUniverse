-- ========================================
-- Script: Verificar Status da Tabela specialties
-- Date: 2025-01-XX
-- Description: Verifica rapidamente o status da tabela specialties
--              Execute este script no ambiente que deseja verificar
-- ========================================

-- ========================================
-- RESUMO RÁPIDO
-- ========================================

SELECT 
    '📊 RESUMO GERAL' as info,
    COUNT(*) as total_especialidades,
    COUNT(*) FILTER (WHERE active = true) as ativas,
    COUNT(*) FILTER (WHERE active = false) as inativas,
    COUNT(DISTINCT category) as total_categorias,
    COUNT(DISTINCT role) as total_roles
FROM specialties;

-- ========================================
-- VERIFICAR COLUNAS
-- ========================================

SELECT 
    '✅ COLUNAS' as info,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'id') THEN '✅' ELSE '❌' END || ' id' as coluna,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'name') THEN '✅' ELSE '❌' END || ' name' as coluna2,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'category') THEN '✅' ELSE '❌' END || ' category' as coluna3,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'description') THEN '✅' ELSE '❌' END || ' description' as coluna4,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'created_at') THEN '✅' ELSE '❌' END || ' created_at' as coluna5,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'active') THEN '✅' ELSE '❌' END || ' active' as coluna6,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'role') THEN '✅' ELSE '❌' END || ' role' as coluna7;

-- ========================================
-- ESPECIALIDADES ESPERADAS (Total: 55)
-- ========================================

WITH expected_count AS (
    SELECT 55 as total_esperado
),
actual_count AS (
    SELECT COUNT(*) as total_atual FROM specialties
)
SELECT 
    '📈 COMPARAÇÃO' as info,
    e.total_esperado as esperado,
    a.total_atual as atual,
    e.total_esperado - a.total_atual as faltando,
    CASE 
        WHEN a.total_atual = e.total_esperado THEN '✅ OK'
        WHEN a.total_atual < e.total_esperado THEN '⚠️ FALTANDO ' || (e.total_esperado - a.total_atual) || ' especialidades'
        ELSE '⚠️ EXTRA: ' || (a.total_atual - e.total_esperado) || ' especialidades'
    END as status
FROM expected_count e, actual_count a;

-- ========================================
-- LISTAR ESPECIALIDADES FALTANDO
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
    '❌ FALTANDO' as status,
    e.name as especialidade
FROM expected_specialties e
LEFT JOIN specialties s ON s.name = e.name
WHERE s.name IS NULL
ORDER BY e.name;

-- ========================================
-- LISTAR TODAS AS ESPECIALIDADES ATUAIS
-- ========================================

SELECT 
    '📋 ESPECIALIDADES ATUAIS' as info,
    name,
    category,
    role,
    active,
    description
FROM specialties
ORDER BY category, name;

