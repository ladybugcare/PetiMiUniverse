-- ========================================
-- Migration: Trigger para atualização automática de filled_positions
-- Date: 2025-01-XX
-- Description: Cria trigger que atualiza filled_positions automaticamente
--              quando o status de uma aplicação muda para 'approved' ou de 'approved' para outro status
-- ========================================

-- Função para atualizar filled_positions
CREATE OR REPLACE FUNCTION update_filled_positions_on_application_status()
RETURNS TRIGGER AS $$
DECLARE
  v_demand_id uuid;
  v_old_status text;
  v_new_status text;
  v_current_filled integer;
  v_vacancies integer;
BEGIN
  -- Obter demand_id da aplicação
  v_demand_id := NEW.demand_id;
  v_old_status := COALESCE(OLD.status, '');
  v_new_status := NEW.status;

  -- Buscar dados da demanda
  SELECT filled_positions, vacancies
  INTO v_current_filled, v_vacancies
  FROM demands
  WHERE id = v_demand_id;

  -- Se não encontrou a demanda, retornar
  IF v_current_filled IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se status mudou para 'approved' e não estava aprovado antes
  IF v_new_status = 'approved' AND v_old_status != 'approved' THEN
    -- Incrementar filled_positions apenas se não exceder vacancies
    IF v_current_filled < v_vacancies THEN
      UPDATE demands
      SET 
        filled_positions = v_current_filled + 1,
        updated_at = now()
      WHERE id = v_demand_id;
    END IF;
  END IF;

  -- Se status mudou de 'approved' para outro status
  IF v_old_status = 'approved' AND v_new_status != 'approved' THEN
    -- Decrementar filled_positions (não pode ser negativo)
    UPDATE demands
    SET 
      filled_positions = GREATEST(0, v_current_filled - 1),
      updated_at = now()
    WHERE id = v_demand_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_update_filled_positions ON demand_applications;
CREATE TRIGGER trigger_update_filled_positions
  AFTER UPDATE OF status ON demand_applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_filled_positions_on_application_status();

-- Comentários
COMMENT ON FUNCTION update_filled_positions_on_application_status() IS 
  'Atualiza automaticamente filled_positions quando status da aplicação muda para/de approved';

COMMENT ON TRIGGER trigger_update_filled_positions ON demand_applications IS 
  'Dispara atualização de filled_positions quando status da aplicação muda';

-- Mensagem de sucesso
SELECT 'Migration add_filled_positions_trigger.sql concluída com sucesso!' as status;

