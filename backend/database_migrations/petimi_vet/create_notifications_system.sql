-- ========================================
-- MIGRATION: Sistema de Notificações
-- Date: 2025-10-30
-- Description: Sistema completo de notificações in-app para todos os usuários
-- ========================================

-- ========================================
-- 1. CRIAR TABELA NOTIFICATIONS
-- ========================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'application_received',      -- Clínica recebe candidatura
    'application_accepted',      -- Vet teve candidatura aceita
    'application_rejected',      -- Vet teve candidatura rejeitada
    'support_reply',            -- Resposta em ticket de suporte
    'unit_invitation',          -- Convite para unidade
    'marketplace_message',      -- Mensagem no marketplace
    'demand_status_changed',    -- Status de demanda mudou
    'new_demand_created'        -- Nova demanda criada (para vets)
  )),
  title text NOT NULL CHECK (length(title) >= 1 AND length(title) <= 200),
  message text NOT NULL CHECK (length(message) >= 1 AND length(message) <= 500),
  link text,                    -- URL para redirecionar ao clicar
  entity_type text,             -- 'demand', 'application', 'ticket', etc
  entity_id uuid,               -- ID da entidade relacionada
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- ========================================
-- 2. CRIAR ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

-- ========================================
-- 3. COMENTÁRIOS
-- ========================================
COMMENT ON TABLE notifications IS 'Sistema de notificações in-app para todos os usuários';
COMMENT ON COLUMN notifications.type IS 'Tipo da notificação que determina o ícone e comportamento';
COMMENT ON COLUMN notifications.title IS 'Título curto da notificação (max 200 chars)';
COMMENT ON COLUMN notifications.message IS 'Mensagem descritiva (max 500 chars)';
COMMENT ON COLUMN notifications.link IS 'URL relativa para redirecionar ao clicar na notificação';
COMMENT ON COLUMN notifications.entity_type IS 'Tipo da entidade relacionada (demand, application, ticket, etc)';
COMMENT ON COLUMN notifications.entity_id IS 'ID da entidade relacionada';
COMMENT ON COLUMN notifications.read IS 'Se a notificação foi lida pelo usuário';

-- ========================================
-- 4. FUNÇÃO PARA LIMPEZA AUTOMÁTICA (OPCIONAL)
-- ========================================
-- Remove notificações lidas com mais de 30 dias
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications 
  WHERE read = true 
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. VERIFICAÇÃO
-- ========================================
SELECT 
  'notifications' as tabela,
  COUNT(*) as total_registros
FROM notifications;

-- ========================================
-- 6. EXEMPLO DE NOTIFICAÇÃO
-- ========================================
-- INSERT INTO notifications (user_id, type, title, message, link, entity_type, entity_id)
-- VALUES (
--   'user-uuid-here',
--   'application_received',
--   'Nova Candidatura',
--   'João Silva se candidatou à sua vaga de Veterinário',
--   '/demands/demand-id/applications',
--   'application',
--   'application-uuid-here'
-- );

