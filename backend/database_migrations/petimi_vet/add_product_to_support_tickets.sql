-- ========================================
-- Migration: Produto de origem em support_tickets (Hub / Shift)
-- Description: Fila de suporte PetiMi unificada; cada ticket indica de qual produto veio.
--   - product: 'shift' (antigo Vet) ou 'hub'
--   - clinic_id: clínica do usuário Hub (staff em clinic_users), para exibir na fila admin
--
-- Idempotente: também garante as colunas/tabelas das migrations anteriores de suporte
-- (conversação, avaliação, categoria, prioridade, anexos, guest), para bases em que
-- alguma delas não foi aplicada. Pode ser executada mais de uma vez.
-- ========================================

-- 1. Colunas de support_tickets usadas pelo backend
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_message_by text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS attachments text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'shift',
  ADD COLUMN IF NOT EXISTS clinic_id uuid NULL;

-- Colunas legadas passam a ser opcionais (primeira mensagem vive em ticket_messages)
ALTER TABLE support_tickets ALTER COLUMN message DROP NOT NULL;
ALTER TABLE support_tickets ALTER COLUMN user_read DROP NOT NULL;
ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;

-- 2. Constraints (recriadas para ficar no estado final)
ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_last_message_by_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_last_message_by_check
  CHECK (last_message_by IS NULL OR last_message_by IN ('user', 'admin'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IS NULL OR category IN ('técnico', 'financeiro', 'conta_perfil', 'demanda', 'marketplace', 'outro'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority IS NULL OR priority IN ('baixa', 'normal', 'alta', 'urgente'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_user_role_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_role_check
  CHECK (user_role IN ('clinic', 'vet', 'freelancer', 'admin', 'guest'));

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_product_check;
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_product_check
  CHECK (product IN ('hub', 'shift'));

COMMENT ON COLUMN support_tickets.product IS 'Produto de origem do ticket: hub (PetMi Hub) ou shift (PetMi Shift)';
COMMENT ON COLUMN support_tickets.clinic_id IS 'Clínica do usuário que abriu o ticket (preenchido pelo Hub)';
COMMENT ON COLUMN support_tickets.attachments IS 'Array de URLs de anexos (imagens/documentos)';

-- 3. Conversa e avaliação
CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  message text NOT NULL CHECK (length(message) >= 5 AND length(message) <= 1000),
  read_by_receiver boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ticket_messages ALTER COLUMN sender_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS ticket_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_evaluations_ticket_id ON ticket_evaluations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_product ON support_tickets(product);
CREATE INDEX IF NOT EXISTS idx_support_tickets_product_status_created
  ON support_tickets(product, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_clinic_id
  ON support_tickets(clinic_id) WHERE clinic_id IS NOT NULL;

-- 5. Recarrega o cache de schema do PostgREST (senão a API segue sem ver as colunas novas)
NOTIFY pgrst, 'reload schema';

SELECT 'Migration add_product_to_support_tickets.sql concluída com sucesso!' AS status;
