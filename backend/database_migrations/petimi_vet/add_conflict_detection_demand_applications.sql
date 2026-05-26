-- ========================================
-- Migration: Sistema de detecção de conflitos para demand_applications
-- Date: 2025-01-XX
-- Description: Cria função e trigger para detectar e tratar conflitos de horário
--              em demand_applications (demandas simples)
-- ========================================

-- Função para verificar conflitos de horário em demand_applications
CREATE OR REPLACE FUNCTION check_time_conflict_demand_applications(
  p_vet_id uuid,
  p_demand_date date,
  p_start_time time,
  p_end_time time,
  p_exclude_application_id uuid DEFAULT NULL
) RETURNS TABLE (
  conflicting_application_id uuid,
  conflicting_demand_id uuid,
  conflicting_demand_title text,
  conflicting_date date,
  conflicting_start_time time,
  conflicting_end_time time
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    da.id as conflicting_application_id,
    d.id as conflicting_demand_id,
    d.title as conflicting_demand_title,
    d.demand_date as conflicting_date,
    d.start_time as conflicting_start_time,
    d.end_time as conflicting_end_time
  FROM demand_applications da
  JOIN demands d ON da.demand_id = d.id
  WHERE da.vet_id = p_vet_id
    AND da.status IN ('approved', 'check_in', 'check_out', 'report_sent', 'report_approved')
    AND d.demand_date = p_demand_date
    AND (p_exclude_application_id IS NULL OR da.id != p_exclude_application_id)
    AND (
      -- Verificar sobreposição de horários usando OVERLAPS
      (d.start_time, COALESCE(d.end_time, d.start_time + INTERVAL '1 hour')) 
      OVERLAPS 
      (p_start_time, COALESCE(p_end_time, p_start_time + INTERVAL '1 hour'))
    );
END;
$$ LANGUAGE plpgsql;

-- Função trigger para inativar aplicações conflitantes ao aprovar
CREATE OR REPLACE FUNCTION handle_application_acceptance_demand_applications()
RETURNS TRIGGER AS $$
DECLARE
  v_demand_id uuid;
  v_demand_date date;
  v_start_time time;
  v_end_time time;
  v_vet_id uuid;
  v_conflicts RECORD;
BEGIN
  -- Só processa quando status muda para 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Buscar dados da demanda
    SELECT d.id, d.demand_date, d.start_time, d.end_time, NEW.vet_id
    INTO v_demand_id, v_demand_date, v_start_time, v_end_time, v_vet_id
    FROM demands d
    WHERE d.id = NEW.demand_id;
    
    -- Se não encontrou dados da demanda, retornar
    IF v_demand_id IS NULL OR v_demand_date IS NULL OR v_start_time IS NULL THEN
      RETURN NEW;
    END IF;
    
    -- Buscar aplicações conflitantes
    FOR v_conflicts IN 
      SELECT * FROM check_time_conflict_demand_applications(
        v_vet_id,
        v_demand_date,
        v_start_time,
        v_end_time,
        NEW.id
      )
    LOOP
      -- Inativar aplicação conflitante (mudar para rejected_by_vet com motivo)
      UPDATE demand_applications
      SET 
        status = 'rejected_by_vet',
        updated_at = now()
      WHERE id = v_conflicts.conflicting_application_id
        AND status IN ('approved', 'applied', 'invited');
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_application_acceptance_demand_applications ON demand_applications;
CREATE TRIGGER trigger_application_acceptance_demand_applications
  AFTER UPDATE OF status ON demand_applications
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved'))
  EXECUTE FUNCTION handle_application_acceptance_demand_applications();

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_demand_applications_vet_status 
  ON demand_applications(vet_id, status) 
  WHERE status IN ('approved', 'check_in', 'check_out', 'report_sent', 'report_approved');

CREATE INDEX IF NOT EXISTS idx_demands_date_time 
  ON demands(demand_date, start_time, end_time);

-- Comentários
COMMENT ON FUNCTION check_time_conflict_demand_applications(uuid, date, time, time, uuid) IS 
  'Verifica conflitos de horário para aplicações em demand_applications';

COMMENT ON FUNCTION handle_application_acceptance_demand_applications() IS 
  'Inativa aplicações conflitantes quando uma aplicação é aprovada';

COMMENT ON TRIGGER trigger_application_acceptance_demand_applications ON demand_applications IS 
  'Dispara inativação de aplicações conflitantes ao aprovar uma aplicação';

-- Mensagem de sucesso
SELECT 'Migration add_conflict_detection_demand_applications.sql concluída com sucesso!' as status;

