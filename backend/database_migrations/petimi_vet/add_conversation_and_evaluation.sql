-- ========================================
-- MIGRAÇÃO: Adicionar Histórico de Conversação e Avaliação
-- ========================================

-- 1. Criar tabela de mensagens
CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  message text NOT NULL CHECK (length(message) >= 5 AND length(message) <= 1000),
  read_by_receiver boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at);

-- Comentários
COMMENT ON TABLE ticket_messages IS 'Armazena todas as mensagens trocadas em tickets de suporte';
COMMENT ON COLUMN ticket_messages.sender_role IS 'Papel do remetente: user (cliente/vet) ou admin';
COMMENT ON COLUMN ticket_messages.read_by_receiver IS 'Se a mensagem foi lida pelo destinatário';

-- 2. Criar tabela de avaliações
CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamp with time zone DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_ticket_id ON ticket_evaluations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_rating ON ticket_evaluations(rating);

-- Comentários
COMMENT ON TABLE ticket_evaluations IS 'Avaliações dos usuários sobre o atendimento recebido';
COMMENT ON COLUMN ticket_evaluations.rating IS 'Nota de 1 a 5 estrelas';
COMMENT ON COLUMN ticket_evaluations.comment IS 'Comentário opcional do usuário';

-- 3. Migrar dados existentes para ticket_messages
-- Migrar mensagens dos usuários
INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message, created_at, read_by_receiver)
SELECT 
  id as ticket_id,
  user_id as sender_id,
  CASE 
    WHEN user_role = 'clinic' THEN 'user'
    WHEN user_role = 'vet' THEN 'user'
    ELSE 'user'
  END as sender_role,
  COALESCE(message, 'Mensagem não disponível') as message,
  created_at,
  true as read_by_receiver -- Admin já leu (mensagem foi criada)
FROM support_tickets
WHERE message IS NOT NULL AND message != '';

-- Migrar respostas dos admins
INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message, created_at, read_by_receiver)
SELECT 
  st.id as ticket_id,
  st.admin_id as sender_id,
  'admin' as sender_role,
  st.admin_reply as message,
  st.updated_at as created_at,
  st.user_read as read_by_receiver
FROM support_tickets st
WHERE st.admin_reply IS NOT NULL 
  AND st.admin_reply != ''
  AND st.admin_id IS NOT NULL;

-- 4. Adicionar novas colunas à tabela support_tickets
ALTER TABLE support_tickets 
  ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_message_by text CHECK (last_message_by IN ('user', 'admin'));

-- Atualizar last_message_at com base nas mensagens migradas
UPDATE support_tickets st
SET last_message_at = (
  SELECT MAX(created_at)
  FROM ticket_messages tm
  WHERE tm.ticket_id = st.id
),
last_message_by = (
  SELECT sender_role
  FROM ticket_messages tm
  WHERE tm.ticket_id = st.id
  ORDER BY created_at DESC
  LIMIT 1
);

-- 5. Tornar colunas antigas opcionais (para retrocompatibilidade)
-- Remover constraint NOT NULL das colunas antigas
ALTER TABLE support_tickets 
  ALTER COLUMN message DROP NOT NULL,
  ALTER COLUMN user_read DROP NOT NULL;

-- Marcar dados antigos como NULL (já foram migrados para as novas tabelas)
UPDATE support_tickets SET message = NULL WHERE message IS NOT NULL;
UPDATE support_tickets SET admin_reply = NULL WHERE admin_reply IS NOT NULL;

-- OPCIONAL: Se quiser remover as colunas completamente após confirmar que tudo funciona:
-- ALTER TABLE support_tickets 
--   DROP COLUMN IF EXISTS message,
--   DROP COLUMN IF EXISTS admin_reply,
--   DROP COLUMN IF EXISTS admin_id,
--   DROP COLUMN IF EXISTS user_read;

-- Comentários nas novas colunas
COMMENT ON COLUMN support_tickets.last_message_at IS 'Data/hora da última mensagem enviada no ticket';
COMMENT ON COLUMN support_tickets.last_message_by IS 'Quem enviou a última mensagem: user ou admin';

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Verificar quantas mensagens foram migradas
SELECT 
  'Mensagens de usuários' as tipo,
  COUNT(*) as total
FROM ticket_messages
WHERE sender_role = 'user'
UNION ALL
SELECT 
  'Mensagens de admins' as tipo,
  COUNT(*) as total
FROM ticket_messages
WHERE sender_role = 'admin';

-- Verificar estrutura das tabelas
SELECT 
  'ticket_messages' as tabela,
  COUNT(*) as total_registros
FROM ticket_messages
UNION ALL
SELECT 
  'ticket_evaluations' as tabela,
  COUNT(*) as total_registros
FROM ticket_evaluations;

