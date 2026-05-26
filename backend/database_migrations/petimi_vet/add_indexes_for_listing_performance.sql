-- ========================================
-- Migration: Adicionar índices para melhorar performance de listagens
-- Date: 2025-01-17
-- Description: Adiciona índices em created_at e status para acelerar queries de listagem
-- ========================================

-- ========================================
-- ÍNDICES PARA CLINICS
-- ========================================
-- Índice composto para ordenação por created_at (usado em listagens)
CREATE INDEX IF NOT EXISTS idx_clinics_created_at_desc ON clinics(created_at DESC);

-- Índice composto para filtros comuns (status + created_at)
CREATE INDEX IF NOT EXISTS idx_clinics_status_created_at ON clinics(status, created_at DESC);

-- ========================================
-- ÍNDICES PARA VETS
-- ========================================
-- Índice composto para ordenação por created_at (usado em listagens)
CREATE INDEX IF NOT EXISTS idx_vets_created_at_desc ON vets(created_at DESC);

-- Índice composto para filtros comuns (status + created_at)
CREATE INDEX IF NOT EXISTS idx_vets_status_created_at ON vets(status, created_at DESC);

-- ========================================
-- ÍNDICES PARA FREELANCERS
-- ========================================
-- Índice composto para ordenação por created_at (usado em listagens)
CREATE INDEX IF NOT EXISTS idx_freelancers_created_at_desc ON freelancers(created_at DESC);

-- Índice composto para filtros comuns (status + created_at)
CREATE INDEX IF NOT EXISTS idx_freelancers_status_created_at ON freelancers(status, created_at DESC);

-- Índice para approval_status (usado em filtros de pendentes)
CREATE INDEX IF NOT EXISTS idx_freelancers_approval_status_created_at ON freelancers(approval_status, created_at DESC) WHERE approval_status IN ('pending', 'pending_approval', 'pending_review');

-- ========================================
-- VERIFICAÇÃO
-- ========================================
SELECT 
  '✅ Índices de performance adicionados para clinics, vets e freelancers' as status;

