-- ========================================
-- Migration: Adicionar Suporte a Admin no Sistema de Mensagens
-- Date: 2025-01-30
-- Description: Adiciona suporte para administradores criarem e participarem de conversas
-- com qualquer usuário (clínicas, veterinários e freelancers)
-- ========================================

-- ========================================
-- ATUALIZAR TABELA: conversations
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

-- Atualizar constraint de ordem: admin sempre primeiro se houver
ALTER TABLE conversations
  ADD CONSTRAINT check_participant_order CHECK (
    -- Admin sempre pode conversar com qualquer um (admin primeiro)
    (participant1_type = 'admin' AND participant2_type IN ('clinic', 'vet', 'freelancer')) OR
    -- Regras existentes (clinic primeiro se houver)
    (participant1_type = 'clinic' AND participant2_type IN ('vet', 'freelancer')) OR
    (participant1_type = 'vet' AND participant2_type = 'clinic') OR
    (participant1_type = 'freelancer' AND participant2_type = 'clinic')
  );

-- Atualizar constraint de pares válidos: bloquear admin ↔ admin
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS check_valid_pair;

ALTER TABLE conversations
  ADD CONSTRAINT check_valid_pair CHECK (
    -- Bloquear vet ↔ freelancer (existente)
    NOT (participant1_type = 'vet' AND participant2_type = 'freelancer') AND
    NOT (participant1_type = 'freelancer' AND participant2_type = 'vet') AND
    -- Bloquear admin ↔ admin
    NOT (participant1_type = 'admin' AND participant2_type = 'admin')
  );

-- Atualizar comentários
COMMENT ON COLUMN conversations.participant1_type IS 'Tipo do primeiro participante: clinic, vet, freelancer ou admin';
COMMENT ON COLUMN conversations.participant2_type IS 'Tipo do segundo participante: clinic, vet, freelancer ou admin';
COMMENT ON TABLE conversations IS 'Conversas entre participantes (clinic↔vet, clinic↔freelancer, admin↔qualquer)';

-- ========================================
-- ATUALIZAR TABELA: messages
-- ========================================

-- Remover constraint antiga
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_sender_type_check;
  
-- Adicionar novo constraint permitindo 'admin'
ALTER TABLE messages
  ADD CONSTRAINT messages_sender_type_check 
    CHECK (sender_type IN ('clinic', 'vet', 'freelancer', 'admin'));

-- Atualizar comentário
COMMENT ON COLUMN messages.sender_type IS 'Tipo do remetente: clinic, vet, freelancer ou admin';

-- ========================================
-- VERIFICAÇÃO DE SUCESSO
-- ========================================
SELECT 'Migration add_admin_to_messages_system.sql concluída com sucesso!' as status;

-- Verificar constraints atualizados
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'conversations'::regclass
  AND conname IN ('conversations_participant1_type_check', 'conversations_participant2_type_check', 'check_participant_order', 'check_valid_pair');

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'messages'::regclass
  AND conname = 'messages_sender_type_check';

