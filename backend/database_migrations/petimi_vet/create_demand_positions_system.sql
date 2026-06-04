-- Migration: Create Demand Positions System
-- Date: 2025-10-29
-- Description: Implementa sistema de demandas com múltiplas posições profissionais,
--              gerenciamento de vagas, e auto-inativação de candidaturas conflitantes

-- ========================================
-- 1. MODIFICAR TABELA DEMANDS
-- ========================================

-- Adicionar campos novos
ALTER TABLE demands
ADD COLUMN IF NOT EXISTS is_composite boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS end_time time;

-- Migrar dados existentes (duration_hours → end_time)
UPDATE demands 
SET end_time = (start_time::time + (COALESCE(duration_hours, 8) || ' hours')::interval)::time
WHERE end_time IS NULL;

-- Remover coluna antiga
ALTER TABLE demands DROP COLUMN IF EXISTS duration_hours;

-- ========================================
-- 2. CRIAR TABELA DEMAND_POSITIONS
-- ========================================

CREATE TABLE IF NOT EXISTS demand_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_demand_id uuid NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  specialty text NOT NULL,
  total_slots integer NOT NULL DEFAULT 1 CHECK (total_slots > 0),
  filled_slots integer NOT NULL DEFAULT 0 CHECK (filled_slots >= 0),
  individual_payment numeric(10,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT slots_check CHECK (filled_slots <= total_slots)
);

-- Índices para demand_positions
CREATE INDEX IF NOT EXISTS idx_demand_positions_master ON demand_positions(master_demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_positions_status ON demand_positions(status);
CREATE INDEX IF NOT EXISTS idx_demand_positions_specialty ON demand_positions(specialty);

-- ========================================
-- 3. CRIAR TABELA POSITION_APPLICATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS position_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'accepted', 
    'rejected',
    'cancelled_by_vet',
    'inactive_accepted_other_position',
    'inactive_time_conflict'
  )),
  message text,
  accepted_at timestamp with time zone,
  inactive_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(position_id, vet_id)
);

-- Índices para position_applications
CREATE INDEX IF NOT EXISTS idx_position_applications_position ON position_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_vet ON position_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_status ON position_applications(status);

-- ========================================
-- 4. CRIAR VIEW PARA POSIÇÕES DISPONÍVEIS
-- ========================================

CREATE OR REPLACE VIEW positions_with_availability AS
SELECT 
  dp.id,
  dp.master_demand_id,
  dp.specialty,
  dp.total_slots,
  dp.filled_slots,
  dp.individual_payment,
  dp.status,
  dp.description,
  dp.created_at,
  d.title,
  d.description as demand_description,
  d.clinic_id,
  d.unit_id,
  d.demand_date,
  d.start_time,
  d.end_time,
  d.category,
  (dp.total_slots - dp.filled_slots) as available_slots,
  CONCAT(dp.filled_slots, '/', dp.total_slots) as progress
FROM demand_positions dp
JOIN demands d ON d.id = dp.master_demand_id
WHERE dp.status = 'open' AND d.status = 'open';

-- ========================================
-- 5. FUNÇÃO PARA VERIFICAR CONFLITO DE HORÁRIO
-- ========================================

CREATE OR REPLACE FUNCTION check_time_conflict(
  p_vet_id uuid,
  p_demand_date date,
  p_start_time time,
  p_end_time time
) RETURNS TABLE (
  conflicting_application_id uuid,
  conflicting_demand_title text,
  conflicting_date date,
  conflicting_start_time time,
  conflicting_end_time time
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id as conflicting_application_id,
    d.title as conflicting_demand_title,
    d.demand_date as conflicting_date,
    d.start_time as conflicting_start_time,
    d.end_time as conflicting_end_time
  FROM position_applications pa
  JOIN demand_positions dp ON pa.position_id = dp.id
  JOIN demands d ON dp.master_demand_id = d.id
  WHERE pa.vet_id = p_vet_id
    AND pa.status = 'accepted'
    AND d.demand_date = p_demand_date
    AND (d.start_time, d.end_time) OVERLAPS (p_start_time, p_end_time);
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 6. TRIGGER PARA AUTO-INATIVAR CANDIDATURAS
-- ========================================

CREATE OR REPLACE FUNCTION handle_application_acceptance()
RETURNS TRIGGER AS $$
DECLARE
  v_master_demand_id uuid;
  v_demand_date date;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Só executa quando status muda para 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    
    -- Obter informações da demanda
    SELECT dp.master_demand_id, d.demand_date, d.start_time, d.end_time
    INTO v_master_demand_id, v_demand_date, v_start_time, v_end_time
    FROM demand_positions dp
    JOIN demands d ON dp.master_demand_id = d.id
    WHERE dp.id = NEW.position_id;
    
    -- 1. Inativar outras candidaturas da MESMA demanda
    UPDATE position_applications
    SET 
      status = 'inactive_accepted_other_position',
      inactive_reason = 'Veterinário aceito em outra posição desta demanda',
      updated_at = now()
    WHERE vet_id = NEW.vet_id
      AND position_id IN (
        SELECT id FROM demand_positions WHERE master_demand_id = v_master_demand_id
      )
      AND id != NEW.id
      AND status IN ('pending');
    
    -- 2. Inativar candidaturas com conflito de horário (outras demandas)
    UPDATE position_applications pa
    SET 
      status = 'inactive_time_conflict',
      inactive_reason = 'Indisponível - Aceito em outra demanda no mesmo horário',
      updated_at = now()
    FROM demand_positions dp
    JOIN demands d ON dp.master_demand_id = d.id
    WHERE pa.position_id = dp.id
      AND pa.vet_id = NEW.vet_id
      AND pa.id != NEW.id
      AND pa.status IN ('pending')
      AND dp.master_demand_id != v_master_demand_id
      AND d.demand_date = v_demand_date
      AND (d.start_time, d.end_time) OVERLAPS (v_start_time, v_end_time);
    
    -- 3. Incrementar filled_slots
    UPDATE demand_positions
    SET 
      filled_slots = filled_slots + 1,
      updated_at = now()
    WHERE id = NEW.position_id;
    
    -- 4. Atualizar status da posição se completou
    UPDATE demand_positions
    SET 
      status = 'filled',
      updated_at = now()
    WHERE id = NEW.position_id
      AND filled_slots >= total_slots;
      
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger
DROP TRIGGER IF EXISTS trigger_application_acceptance ON position_applications;
CREATE TRIGGER trigger_application_acceptance
AFTER UPDATE ON position_applications
FOR EACH ROW
EXECUTE FUNCTION handle_application_acceptance();

-- ========================================
-- 7. FUNÇÃO PARA DECREMENTAR SLOTS (quando rejeita)
-- ========================================

CREATE OR REPLACE FUNCTION handle_application_rejection()
RETURNS TRIGGER AS $$
BEGIN
  -- Se estava aceito e mudou para rejected ou cancelled
  IF OLD.status = 'accepted' AND NEW.status IN ('rejected', 'cancelled_by_vet') THEN
    
    -- Decrementar filled_slots
    UPDATE demand_positions
    SET 
      filled_slots = GREATEST(filled_slots - 1, 0),
      status = 'open',
      updated_at = now()
    WHERE id = OLD.position_id;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger de rejeição
DROP TRIGGER IF EXISTS trigger_application_rejection ON position_applications;
CREATE TRIGGER trigger_application_rejection
AFTER UPDATE ON position_applications
FOR EACH ROW
EXECUTE FUNCTION handle_application_rejection();

-- ========================================
-- 8. COMENTÁRIOS E DOCUMENTAÇÃO
-- ========================================

COMMENT ON TABLE demand_positions IS 'Posições profissionais dentro de uma demanda mestre';
COMMENT ON TABLE position_applications IS 'Candidaturas de veterinários para posições específicas';
COMMENT ON COLUMN demand_positions.total_slots IS 'Total de vagas disponíveis para esta posição';
COMMENT ON COLUMN demand_positions.filled_slots IS 'Quantas vagas já foram preenchidas';
COMMENT ON COLUMN position_applications.status IS 'pending: aguardando, accepted: aceito, rejected: rejeitado, inactive_accepted_other_position: aceito em outra posição da mesma demanda, inactive_time_conflict: conflito de horário com demanda aceita';

-- ========================================
-- 9. QUERIES DE VERIFICAÇÃO
-- ========================================

-- Verificar estrutura das tabelas
-- SELECT table_name, column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name IN ('demand_positions', 'position_applications')
-- ORDER BY table_name, ordinal_position;

-- Verificar índices criados
-- SELECT tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('demand_positions', 'position_applications');

-- Verificar views
-- SELECT viewname, definition FROM pg_views WHERE viewname = 'positions_with_availability';

