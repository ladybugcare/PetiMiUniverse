-- ========================================
-- Migration: Adicionar demand_id na tabela messages
-- Date: 2025-01-30
-- Description: Adiciona campo demand_id para rastrear qual demanda iniciou cada mensagem
-- ========================================

-- Adicionar coluna demand_id na tabela messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS demand_id uuid REFERENCES demands(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_messages_demand_id ON messages(demand_id) WHERE demand_id IS NOT NULL;

-- Comentário
COMMENT ON COLUMN messages.demand_id IS 'ID da demanda relacionada à mensagem (quando mensagem foi enviada da página de demanda)';

