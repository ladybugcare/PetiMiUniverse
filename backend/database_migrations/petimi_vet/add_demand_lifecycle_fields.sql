-- ========================================
-- Migration: Adicionar campos de lifecycle em demands
-- Date: 2025-11-18
-- Description: Adiciona campos vacancies e filled_positions, e expande
--              constraint de status para incluir novos status do lifecycle
-- ========================================

-- Adicionar colunas de controle de vagas
ALTER TABLE demands
ADD COLUMN IF NOT EXISTS vacancies integer DEFAULT 1 CHECK (vacancies > 0),
ADD COLUMN IF NOT EXISTS filled_positions integer DEFAULT 0 CHECK (filled_positions >= 0);

-- Adicionar constraint para garantir que filled_positions <= vacancies
ALTER TABLE demands
DROP CONSTRAINT IF EXISTS demands_filled_positions_check;

ALTER TABLE demands
ADD CONSTRAINT demands_filled_positions_check CHECK (filled_positions <= vacancies);

-- Expandir constraint de status em demands
ALTER TABLE demands
DROP CONSTRAINT IF EXISTS demands_status_check;

ALTER TABLE demands
ADD CONSTRAINT demands_status_check CHECK (status IN (
  'open',                  -- Demanda aberta
  'with_applicants',       -- Tem candidatos
  'partially_filled',     -- Parcialmente preenchida
  'filled',                -- Completamente preenchida
  'in_progress',           -- Em andamento (pelo menos 1 vet fez check-in)
  'awaiting_report',       -- Aguardando relatórios
  'completed',             -- Concluída
  'canceled_by_clinic',    -- Cancelada pela clínica
  'canceled_by_system',    -- Cancelada pelo sistema
  'expired',               -- Expirada
  'cancelled'              -- Mantido para compatibilidade com dados existentes
));

-- Atualizar demandas existentes
-- Se não tiver vacancies definido, usar 1 como default
UPDATE demands
SET vacancies = 1
WHERE vacancies IS NULL;

-- Se não tiver filled_positions definido, calcular baseado em aplicações aprovadas
-- (será atualizado pela migration de migração de dados)
UPDATE demands
SET filled_positions = 0
WHERE filled_positions IS NULL;

-- Criar índice para status (se não existir)
CREATE INDEX IF NOT EXISTS idx_demands_status ON demands(status);
CREATE INDEX IF NOT EXISTS idx_demands_vacancies ON demands(vacancies);
CREATE INDEX IF NOT EXISTS idx_demands_filled_positions ON demands(filled_positions);

-- Comentários
COMMENT ON COLUMN demands.vacancies IS 'Número total de vagas disponíveis na demanda';
COMMENT ON COLUMN demands.filled_positions IS 'Número de vagas preenchidas (aplicações aprovadas)';
COMMENT ON COLUMN demands.status IS 'Status macro da demanda no lifecycle: open, with_applicants, partially_filled, filled, in_progress, awaiting_report, completed';

-- Mensagem de sucesso
SELECT 'Migration add_demand_lifecycle_fields.sql concluída com sucesso!' as status;

