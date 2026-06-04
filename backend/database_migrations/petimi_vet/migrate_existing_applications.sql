-- ========================================
-- Migration: Migrar dados existentes para demand_applications
-- Date: 2025-11-18
-- Description: Migra dados de applications e position_applications para
--              a nova tabela unificada demand_applications
-- 
-- NOTA: Esta migration está desabilitada porque não há dados para migrar
-- (produto ainda não foi lançado). Se no futuro houver necessidade de migrar
-- dados existentes, descomente as seções abaixo e ajuste conforme necessário.
-- ========================================

-- ========================================
-- PARTE 1: Inicializar filled_positions em demands (se houver dados)
-- ========================================

-- Atualizar filled_positions baseado em aplicações aprovadas existentes
UPDATE demands d
SET filled_positions = (
  SELECT COUNT(*)
  FROM demand_applications da
  WHERE da.demand_id = d.id
  AND da.status IN ('approved', 'check_in', 'check_out', 'report_sent', 'report_approved')
)
WHERE EXISTS (
  SELECT 1 FROM demand_applications da WHERE da.demand_id = d.id
);

-- ========================================
-- PARTE 2: Atualizar status de demands baseado em aplicações existentes
-- ========================================

-- Se tem aplicações, mudar para 'with_applicants' (se ainda estiver 'open')
UPDATE demands d
SET status = 'with_applicants'
WHERE d.status = 'open'
AND EXISTS (
  SELECT 1 FROM demand_applications da 
  WHERE da.demand_id = d.id 
  AND da.status IN ('applied', 'invited')
);

-- Se tem aplicações aprovadas mas não preencheu todas as vagas, mudar para 'partially_filled'
UPDATE demands d
SET status = 'partially_filled'
WHERE d.status IN ('open', 'with_applicants')
AND d.filled_positions > 0
AND d.filled_positions < d.vacancies;

-- Se preencheu todas as vagas, mudar para 'filled'
UPDATE demands d
SET status = 'filled'
WHERE d.status IN ('open', 'with_applicants', 'partially_filled')
AND d.filled_positions >= d.vacancies
AND d.vacancies > 0;

-- ========================================
-- COMENTÁRIOS SOBRE MIGRAÇÃO DE DADOS ANTIGOS
-- ========================================

-- NOTA: A migração de dados das tabelas antigas 'applications' e 
-- 'position_applications' foi desabilitada porque não há dados para migrar.
--
-- Se no futuro houver necessidade de migrar dados existentes, use o script abaixo
-- (ajustando conforme a estrutura real das tabelas antigas):
--
-- -- PARTE 1: Migrar dados de applications (demandas simples)
-- INSERT INTO demand_applications (
--   id, demand_id, vet_id, status, message, applied_at, created_at, updated_at
-- )
-- SELECT 
--   id, demand_id, vet_id,
--   CASE 
--     WHEN status = 'pending' THEN 'applied'
--     WHEN status = 'accepted' THEN 'approved'
--     WHEN status = 'rejected' THEN 'rejected'
--     ELSE 'applied'
--   END as status,
--   message,
--   COALESCE(applied_at, created_at) as applied_at,
--   created_at,
--   updated_at
-- FROM applications
-- WHERE NOT EXISTS (
--   SELECT 1 FROM demand_applications da 
--   WHERE da.demand_id = applications.demand_id 
--   AND da.vet_id = applications.vet_id
-- )
-- ON CONFLICT (demand_id, vet_id) DO NOTHING;
--
-- -- PARTE 2: Migrar dados de position_applications (demandas compostas)
-- INSERT INTO demand_applications (
--   id, demand_id, vet_id, position_id, status, message, applied_at, created_at, updated_at
-- )
-- SELECT 
--   pa.id, dp.master_demand_id as demand_id, pa.vet_id, pa.position_id,
--   CASE 
--     WHEN pa.status = 'pending' THEN 'applied'
--     WHEN pa.status = 'accepted' THEN 'approved'
--     WHEN pa.status = 'rejected' THEN 'rejected'
--     WHEN pa.status = 'cancelled_by_vet' THEN 'canceled_by_vet'
--     ELSE 'applied'
--   END as status,
--   pa.message,
--   COALESCE(pa.accepted_at, pa.created_at) as applied_at,
--   pa.created_at,
--   pa.updated_at
-- FROM position_applications pa
-- JOIN demand_positions dp ON pa.position_id = dp.id
-- WHERE NOT EXISTS (
--   SELECT 1 FROM demand_applications da 
--   WHERE da.demand_id = dp.master_demand_id 
--   AND da.vet_id = pa.vet_id
-- )
-- ON CONFLICT (demand_id, vet_id) DO NOTHING;

-- Mensagem de sucesso
SELECT 'Migration migrate_existing_applications.sql concluída com sucesso!' as status;

