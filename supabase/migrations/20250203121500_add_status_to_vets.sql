-- ========================================
-- Migration: Add status column to vets
-- ========================================

ALTER TABLE vets
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive'));

