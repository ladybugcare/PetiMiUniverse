-- ========================================
-- Migration: Permitir tickets públicos (guest) em support_tickets
-- Date: 2025-01-XX
-- Description: Permite criar tickets de suporte sem autenticação (user_id null, user_role 'guest')
-- ========================================

-- ========================================
-- 1. REMOVER CONSTRAINT DE user_id NOT NULL
-- ========================================
-- Primeiro, remover a constraint de foreign key se existir
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;

-- Tornar user_id nullable
ALTER TABLE support_tickets
  ALTER COLUMN user_id DROP NOT NULL;

-- Recriar foreign key com opção de null
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- ========================================
-- 2. ATUALIZAR CHECK CONSTRAINT DE user_role
-- ========================================
-- Remover constraint antiga
ALTER TABLE support_tickets 
  DROP CONSTRAINT IF EXISTS support_tickets_user_role_check;

-- Adicionar nova constraint incluindo 'guest'
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_role_check 
  CHECK (user_role IN ('clinic', 'vet', 'freelancer', 'admin', 'guest'));

-- ========================================
-- 3. ATUALIZAR COMENTÁRIO
-- ========================================
COMMENT ON COLUMN support_tickets.user_role IS 'Papel do usuário que criou o ticket: clinic, vet, freelancer, admin ou guest (para tickets públicos)';

-- ========================================
-- 4. ATUALIZAR TABELA ticket_messages PARA PERMITIR sender_id NULL
-- ========================================
-- Remover constraint de foreign key se existir
ALTER TABLE ticket_messages
  DROP CONSTRAINT IF EXISTS ticket_messages_sender_id_fkey;

-- Tornar sender_id nullable
ALTER TABLE ticket_messages
  ALTER COLUMN sender_id DROP NOT NULL;

-- Recriar foreign key com opção de null
ALTER TABLE ticket_messages
  ADD CONSTRAINT ticket_messages_sender_id_fkey 
  FOREIGN KEY (sender_id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- ========================================
-- 5. VERIFICAÇÃO
-- ========================================
SELECT 'Migration update_support_tickets_allow_public.sql concluída com sucesso!' as status;

