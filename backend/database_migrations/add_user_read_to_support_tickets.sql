-- Migration: Add user_read column to support_tickets
-- Date: 2025-10-30
-- Description: Adiciona campo user_read para controlar se usuário já visualizou resposta do admin

-- ========================================
-- ADICIONAR COLUNA USER_READ
-- ========================================
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS user_read boolean NOT NULL DEFAULT true;

-- ========================================
-- COMENTÁRIO DA NOVA COLUNA
-- ========================================
COMMENT ON COLUMN support_tickets.user_read IS 'Indica se o usuário já leu a resposta do admin (true = lido, false = não lido)';

-- ========================================
-- ATUALIZAR TICKETS EXISTENTES
-- ========================================
-- Marcar tickets existentes como lidos se não tiverem resposta do admin
-- Marcar como não lidos se tiverem resposta do admin
UPDATE support_tickets 
SET user_read = CASE 
  WHEN admin_reply IS NULL THEN true 
  ELSE false 
END
WHERE user_read IS NULL;

