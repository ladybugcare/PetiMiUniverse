-- ========================================
-- Migration: Expandir constraints de status em tabelas antigas
-- Date: 2025-11-18
-- Description: Expande constraints de status em applications e position_applications
--              para manter compatibilidade durante período de transição
-- ========================================

-- ========================================
-- PARTE 1: Expandir constraint em applications (se tabela ainda existir)
-- ========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications') THEN
    -- Expandir constraint de status em applications
    ALTER TABLE applications
    DROP CONSTRAINT IF EXISTS applications_status_check;

    ALTER TABLE applications
    ADD CONSTRAINT applications_status_check CHECK (status IN (
      'pending',        -- Mantido para compatibilidade
      'accepted',       -- Mantido para compatibilidade
      'rejected',       -- Mantido para compatibilidade
      'applied',        -- Novo
      'approved',       -- Novo (equivalente a accepted)
      'invited',        -- Novo
      'rejected_by_vet' -- Novo
    ));
  END IF;
END $$;

-- ========================================
-- PARTE 2: Expandir constraint em position_applications (se tabela ainda existir)
-- ========================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'position_applications') THEN
    -- Expandir constraint de status em position_applications
    ALTER TABLE position_applications
    DROP CONSTRAINT IF EXISTS position_applications_status_check;

    ALTER TABLE position_applications
    ADD CONSTRAINT position_applications_status_check CHECK (status IN (
      'pending',                      -- Mantido
      'accepted',                     -- Mantido
      'rejected',                     -- Mantido
      'cancelled_by_vet',            -- Mantido
      'inactive_accepted_other_position', -- Mantido
      'inactive_time_conflict',      -- Mantido
      'applied',                     -- Novo
      'approved',                     -- Novo (equivalente a accepted)
      'invited',                      -- Novo
      'rejected_by_vet',             -- Novo
      'check_in',                     -- Novo
      'check_out',                    -- Novo
      'report_sent',                  -- Novo
      'report_approved',              -- Novo
      'canceled_by_vet'              -- Novo (equivalente a cancelled_by_vet)
    ));
  END IF;
END $$;

-- Mensagem de sucesso
SELECT 'Migration expand_old_applications_status.sql concluída com sucesso!' as status;

