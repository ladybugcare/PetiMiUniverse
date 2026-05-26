-- ========================================
-- Migration: Corrigir Constraints para Suportar Admin
-- Date: 2025-11-12
-- Description: Atualiza todas as constraints da tabela conversations para permitir 'admin'
-- ========================================

-- Remover constraints antigas
ALTER TABLE conversations 
  DROP CONSTRAINT IF EXISTS conversations_participant1_type_check,
  DROP CONSTRAINT IF EXISTS conversations_participant2_type_check,
  DROP CONSTRAINT IF EXISTS check_participant_order;

-- Adicionar novos constraints permitindo 'admin'
ALTER TABLE conversations
  ADD CONSTRAINT conversations_participant1_type_check 
    CHECK (participant1_type IN ('clinic', 'vet', 'freelancer', 'admin'));
    
ALTER TABLE conversations
  ADD CONSTRAINT conversations_participant2_type_check 
    CHECK (participant2_type IN ('clinic', 'vet', 'freelancer', 'admin'));

-- Recriar constraint de ordem com suporte a admin
ALTER TABLE conversations
  ADD CONSTRAINT check_participant_order CHECK (
    -- Admin sempre pode conversar com qualquer um (admin primeiro)
    (participant1_type = 'admin' AND participant2_type IN ('clinic', 'vet', 'freelancer')) OR
    -- Regras existentes (clinic primeiro se houver)
    (participant1_type = 'clinic' AND participant2_type IN ('vet', 'freelancer')) OR
    (participant1_type = 'vet' AND participant2_type = 'clinic') OR
    (participant1_type = 'freelancer' AND participant2_type = 'clinic')
  );

-- ========================================
-- ATUALIZAR TABELA: messages
-- ========================================

-- Remover constraint antiga da tabela messages
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;
  
-- Adicionar novo constraint permitindo 'admin'
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_type_check 
    CHECK (sender_type IN ('clinic', 'vet', 'freelancer', 'admin'));

-- Verificar constraints criadas
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'conversations'::regclass
  AND conname IN ('conversations_participant1_type_check', 'conversations_participant2_type_check', 'check_participant_order');

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'messages'::regclass
  AND conname = 'messages_sender_type_check';

SELECT 'Todas as constraints atualizadas com sucesso!' as status;
