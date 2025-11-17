-- ========================================
-- Migration: Adicionar receiver_id e read à tabela marketplace_messages
-- Date: 2025-01-17
-- Description: Adiciona colunas receiver_id e read para suportar sistema de mensagens do marketplace
-- ========================================

-- ========================================
-- ADICIONAR COLUNA RECEIVER_ID
-- ========================================
ALTER TABLE marketplace_messages 
ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Comentário
COMMENT ON COLUMN marketplace_messages.receiver_id IS 'ID do destinatário da mensagem';

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_receiver_id ON marketplace_messages(receiver_id);

-- ========================================
-- ADICIONAR COLUNA READ
-- ========================================
ALTER TABLE marketplace_messages 
ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- Comentário
COMMENT ON COLUMN marketplace_messages.read IS 'Indica se a mensagem foi lida pelo destinatário (true = lida, false = não lida)';

-- Índice para performance (filtrar mensagens não lidas)
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_read ON marketplace_messages(receiver_id, read) WHERE read = false;

-- ========================================
-- ATUALIZAR MENSAGENS EXISTENTES
-- ========================================
-- Se houver mensagens existentes sem receiver_id, precisamos determinar o receiver
-- baseado no item_id (o receiver seria o seller_id do item)
-- Por enquanto, vamos deixar NULL e o sistema precisará migrar manualmente se necessário
-- UPDATE marketplace_messages mm
-- SET receiver_id = (
--   SELECT seller_id 
--   FROM marketplace_items mi 
--   WHERE mi.id = mm.item_id
-- )
-- WHERE receiver_id IS NULL;

-- ========================================
-- VERIFICAÇÃO
-- ========================================
SELECT 
  '✅ Colunas receiver_id e read adicionadas à tabela marketplace_messages' as status;

