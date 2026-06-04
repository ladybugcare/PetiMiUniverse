-- ========================================
-- Migration: Adicionar status para confirmação de email
-- Date: 2025-01-XX
-- Description: Adiciona status 'pending_email' para clínicas aguardando confirmação de email
-- ========================================

-- Remove a constraint antiga
ALTER TABLE clinics 
DROP CONSTRAINT IF EXISTS clinics_status_check;

-- Adiciona a nova constraint com o status de confirmação de email
ALTER TABLE clinics 
ADD CONSTRAINT clinics_status_check 
CHECK (status IN (
  'pending_email',        -- ✅ NOVO: Aguardando confirmação de email
  'pending_unit',         -- Aguardando criação da primeira unidade
  'pending_approval',      -- Aguardando aprovação administrativa
  'active',                -- Clínica ativa e aprovada
  'suspended',            -- Clínica suspensa
  'rejected'              -- Clínica rejeitada
));

-- Mensagem de sucesso
SELECT 'Migration add_pending_email_status.sql concluída com sucesso!' as status;