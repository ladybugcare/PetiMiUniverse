-- ========================================
-- Migration: Corrigir permissões RLS para listagem de usuários
-- Date: 2025-11-17
-- Description: Garante que as tabelas clinics, vets e freelancers possam ser listadas
-- ========================================

-- ========================================
-- 1. DESABILITAR RLS (se estiver habilitado) OU CRIAR POLÍTICAS PERMISSIVAS
-- ========================================

-- Para CLINICS: Permitir leitura para todos (anon e authenticated)
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Allow public read access to clinics" ON clinics;
DROP POLICY IF EXISTS "Allow authenticated read access to clinics" ON clinics;

-- Criar política permissiva para leitura
CREATE POLICY "Allow public read access to clinics"
  ON clinics
  FOR SELECT
  USING (true);

-- Para VETS: Permitir leitura para todos
ALTER TABLE vets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to vets" ON vets;
DROP POLICY IF EXISTS "Allow authenticated read access to vets" ON vets;

CREATE POLICY "Allow public read access to vets"
  ON vets
  FOR SELECT
  USING (true);

-- Para FREELANCERS: Permitir leitura para todos
ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to freelancers" ON freelancers;
DROP POLICY IF EXISTS "Allow authenticated read access to freelancers" ON freelancers;

CREATE POLICY "Allow public read access to freelancers"
  ON freelancers
  FOR SELECT
  USING (true);

-- ========================================
-- 2. GARANTIR PERMISSÕES DE GRANT
-- ========================================

-- Garantir que anon e authenticated possam SELECT
GRANT SELECT ON clinics TO anon;
GRANT SELECT ON clinics TO authenticated;

GRANT SELECT ON vets TO anon;
GRANT SELECT ON vets TO authenticated;

GRANT SELECT ON freelancers TO anon;
GRANT SELECT ON freelancers TO authenticated;

-- ========================================
-- 3. VERIFICAÇÃO
-- ========================================
SELECT 
  '✅ Permissões RLS configuradas para clinics, vets e freelancers' as status;

