-- ========================================
-- Migration: Atualizar Support Tickets para Freelancers e Melhorias
-- Date: 2025-01-30
-- Description: Adiciona suporte a freelancers, categorias, prioridades e anexos
-- ========================================

-- ========================================
-- 1. ATUALIZAR CHECK CONSTRAINT DE user_role
-- ========================================
-- Remover constraint antiga
ALTER TABLE support_tickets 
  DROP CONSTRAINT IF EXISTS support_tickets_user_role_check;

-- Adicionar nova constraint incluindo freelancer
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_role_check 
  CHECK (user_role IN ('clinic', 'vet', 'freelancer'));

-- ========================================
-- 2. ADICIONAR CAMPO category
-- ========================================
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category text CHECK (
    category IN ('técnico', 'financeiro', 'conta_perfil', 'demanda', 'marketplace', 'outro')
  );

-- Comentário
COMMENT ON COLUMN support_tickets.category IS 'Categoria do ticket: técnico, financeiro, conta_perfil, demanda, marketplace, outro';

-- ========================================
-- 3. ADICIONAR CAMPO priority
-- ========================================
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (
    priority IN ('baixa', 'normal', 'alta', 'urgente')
  );

-- Comentário
COMMENT ON COLUMN support_tickets.priority IS 'Prioridade do ticket: baixa, normal, alta, urgente (padrão: normal)';

-- ========================================
-- 4. ADICIONAR CAMPO attachments
-- ========================================
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS attachments text[] DEFAULT '{}';

-- Comentário
COMMENT ON COLUMN support_tickets.attachments IS 'Array de URLs de anexos (imagens/documentos)';

-- ========================================
-- 5. CRIAR ÍNDICES PARA PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_created ON support_tickets(priority, created_at DESC);

-- ========================================
-- 6. ATUALIZAR COMENTÁRIO DA TABELA
-- ========================================
COMMENT ON TABLE support_tickets IS 'Tickets de suporte enviados por usuários (clínicas, veterinários e freelancers) para o admin';

-- ========================================
-- VERIFICAÇÃO DE SUCESSO
-- ========================================
SELECT 'Migration update_support_tickets_for_freelancers.sql concluída com sucesso!' as status;
SELECT 
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'support_tickets' AND column_name = 'category') as category_exists,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'support_tickets' AND column_name = 'priority') as priority_exists,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'support_tickets' AND column_name = 'attachments') as attachments_exists;




