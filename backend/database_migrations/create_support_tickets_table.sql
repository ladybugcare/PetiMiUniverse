-- Migration: Create Support Tickets System
-- Date: 2025-10-30
-- Description: Sistema de tickets de suporte para comunicação entre usuários e admin

-- ========================================
-- CRIAR TABELA SUPPORT_TICKETS
-- ========================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role text NOT NULL CHECK (user_role IN ('clinic', 'vet')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_reply text,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_read boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone
);

-- ========================================
-- CRIAR ÍNDICES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_admin_id ON support_tickets(admin_id);

-- ========================================
-- COMENTÁRIOS
-- ========================================
COMMENT ON TABLE support_tickets IS 'Tickets de suporte enviados por usuários para o admin';
COMMENT ON COLUMN support_tickets.user_role IS 'Papel do usuário que criou o ticket: clinic ou vet';
COMMENT ON COLUMN support_tickets.status IS 'Status do ticket: open (aberto), in_progress (em progresso), resolved (resolvido), closed (fechado)';
COMMENT ON COLUMN support_tickets.admin_reply IS 'Resposta do administrador ao ticket';
COMMENT ON COLUMN support_tickets.user_read IS 'Indica se o usuário já leu a resposta do admin (true = lido, false = não lido)';
COMMENT ON COLUMN support_tickets.resolved_at IS 'Data/hora em que o ticket foi marcado como resolvido';

