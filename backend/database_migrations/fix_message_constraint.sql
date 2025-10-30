-- ========================================
-- FIX: Remover constraint NOT NULL da coluna message
-- ========================================
-- 
-- Execute este script se você já executou a migração anterior
-- e está recebendo erro de "null value in column message"
--

-- Tornar coluna message opcional (nullable)
ALTER TABLE support_tickets 
  ALTER COLUMN message DROP NOT NULL;

-- Tornar coluna user_read opcional (nullable) também
ALTER TABLE support_tickets 
  ALTER COLUMN user_read DROP NOT NULL;

-- Verificar resultado
SELECT 
  column_name, 
  is_nullable, 
  data_type 
FROM information_schema.columns 
WHERE table_name = 'support_tickets' 
  AND column_name IN ('message', 'user_read', 'last_message_at', 'last_message_by')
ORDER BY column_name;

-- Mensagem de sucesso
SELECT 'Correção aplicada com sucesso! A coluna message agora é nullable.' as status;

