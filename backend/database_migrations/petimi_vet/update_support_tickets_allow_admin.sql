-- Migration: Update Support Tickets to Allow Admin Role
-- Date: 2025-01-XX
-- Description: Permite que administradores também possam criar tickets de suporte

-- ========================================
-- ATUALIZAR CONSTRAINT DO BANCO
-- ========================================

-- Remover constraint antiga
ALTER TABLE support_tickets 
DROP CONSTRAINT IF EXISTS support_tickets_user_role_check;

-- Adicionar nova constraint que permite 'admin', 'clinic' e 'vet'
ALTER TABLE support_tickets 
ADD CONSTRAINT support_tickets_user_role_check 
CHECK (user_role IN ('clinic', 'vet', 'admin'));

-- Atualizar comentário da coluna
COMMENT ON COLUMN support_tickets.user_role IS 'Papel do usuário que criou o ticket: clinic, vet ou admin';

-- ========================================
-- VERIFICAÇÃO
-- ========================================
-- Execute para verificar se a constraint foi atualizada:
-- SELECT 
--   conname as constraint_name,
--   pg_get_constraintdef(oid) as constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'support_tickets'::regclass
--   AND conname = 'support_tickets_user_role_check';

