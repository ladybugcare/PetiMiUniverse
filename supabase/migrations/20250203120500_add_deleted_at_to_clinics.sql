-- ========================================
-- Migration: Ensure clinics has deleted_at column
-- ========================================

ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

