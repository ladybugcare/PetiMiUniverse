-- ========================================
-- Migration: Criar Sistema de Mensagens
-- Date: 2025-01-30
-- Description: Cria tabelas para sistema de mensagens entre clínicas, vets e freelancers
-- Regras: clinic↔vet OK, clinic↔freelancer OK, vet↔freelancer BLOQUEADO
-- ========================================

-- ========================================
-- TABELA: conversations
-- ========================================
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant1_type text NOT NULL CHECK (participant1_type IN ('clinic', 'vet', 'freelancer')),
  participant2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant2_type text NOT NULL CHECK (participant2_type IN ('clinic', 'vet', 'freelancer')),
  demand_id uuid REFERENCES demands(id) ON DELETE SET NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  archived_by_participant1 boolean DEFAULT false,
  archived_by_participant2 boolean DEFAULT false,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  
  -- Garantir que não seja vet ↔ freelancer
  CONSTRAINT check_valid_pair CHECK (
    NOT (participant1_type = 'vet' AND participant2_type = 'freelancer') AND
    NOT (participant1_type = 'freelancer' AND participant2_type = 'vet')
  ),
  
  -- Garantir que participant1_id != participant2_id
  CONSTRAINT check_different_participants CHECK (participant1_id != participant2_id),
  
  -- Garantir ordem consistente (sempre clinic primeiro se houver)
  CONSTRAINT check_participant_order CHECK (
    (participant1_type = 'clinic' AND participant2_type IN ('vet', 'freelancer')) OR
    (participant1_type = 'vet' AND participant2_type = 'clinic') OR
    (participant1_type = 'freelancer' AND participant2_type = 'clinic')
  )
);

-- Índice único para evitar conversas duplicadas (mesmo par de participantes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair 
ON conversations (
  LEAST(participant1_id, participant2_id),
  GREATEST(participant1_id, participant2_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant1_id, participant1_type);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant2_id, participant2_type);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_demand_id ON conversations(demand_id) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_application_id ON conversations(application_id) WHERE application_id IS NOT NULL;

COMMENT ON TABLE conversations IS 'Conversas entre participantes (clinic↔vet, clinic↔freelancer)';
COMMENT ON COLUMN conversations.participant1_type IS 'Tipo do primeiro participante: clinic, vet ou freelancer';
COMMENT ON COLUMN conversations.participant2_type IS 'Tipo do segundo participante: clinic, vet ou freelancer';
COMMENT ON COLUMN conversations.demand_id IS 'ID da demanda relacionada (se aplicável)';
COMMENT ON COLUMN conversations.application_id IS 'ID da aplicação relacionada (se aplicável)';
COMMENT ON CONSTRAINT check_valid_pair ON conversations IS 'Bloqueia conversas entre vet e freelancer';

-- ========================================
-- TABELA: messages
-- ========================================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('clinic', 'vet', 'freelancer')),
  message text NOT NULL CHECK (length(message) >= 1 AND length(message) <= 5000),
  read_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

COMMENT ON TABLE messages IS 'Mensagens individuais dentro de conversas';
COMMENT ON COLUMN messages.sender_type IS 'Tipo do remetente: clinic, vet ou freelancer';
COMMENT ON COLUMN messages.read_at IS 'Timestamp quando a mensagem foi lida (NULL = não lida)';
COMMENT ON COLUMN messages.deleted_at IS 'Timestamp quando a mensagem foi deletada (soft delete)';

-- ========================================
-- TABELA: message_reports
-- ========================================
CREATE TABLE IF NOT EXISTS message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_reason text NOT NULL CHECK (length(report_reason) >= 10 AND length(report_reason) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_reports_message_id ON message_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_reported_by ON message_reports(reported_by);
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON message_reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_message_reports_created_at ON message_reports(created_at DESC);

COMMENT ON TABLE message_reports IS 'Reportes de mensagens inadequadas';
COMMENT ON COLUMN message_reports.status IS 'Status do reporte: pending (pendente), reviewed (revisado), resolved (resolvido)';

-- ========================================
-- TABELA: admin_conversation_access_logs
-- ========================================
CREATE TABLE IF NOT EXISTS admin_conversation_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  access_reason text NOT NULL CHECK (access_reason IN ('report', 'support_ticket', 'audit')),
  related_ticket_id uuid REFERENCES support_tickets(id) ON DELETE SET NULL,
  accessed_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_logs_admin_id ON admin_conversation_access_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_conversation_id ON admin_conversation_access_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_logs_accessed_at ON admin_conversation_access_logs(accessed_at DESC);

COMMENT ON TABLE admin_conversation_access_logs IS 'Log de auditoria de acessos admin a conversas';
COMMENT ON COLUMN admin_conversation_access_logs.access_reason IS 'Motivo do acesso: report (mensagem reportada), support_ticket (vinculado a ticket), audit (auditoria)';

-- ========================================
-- TRIGGER: Atualizar last_message_at quando nova mensagem é criada
-- ========================================
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON messages;
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();

-- ========================================
-- VERIFICAÇÃO DE SUCESSO
-- ========================================
SELECT 'Migration create_messages_system.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'conversations') as conversations_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'messages') as messages_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'message_reports') as message_reports_table_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'admin_conversation_access_logs') as access_logs_table_exists;

