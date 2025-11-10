-- Migration: Fix applications table column types
-- Date: 2025-01-XX
-- Description: Converts bigint columns to uuid in applications table
-- Issue: Error "invalid input syntax for type bigint" when querying applications

-- ========================================
-- BACKUP: Create backup of existing data (if any)
-- ========================================
CREATE TABLE IF NOT EXISTS applications_backup AS 
SELECT * FROM applications;

-- ========================================
-- DROP AND RECREATE: applications table with correct types
-- ========================================
DROP TABLE IF EXISTS applications CASCADE;

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id uuid NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  message text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  applied_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(demand_id, vet_id)
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_applications_demand_id ON applications(demand_id);
CREATE INDEX IF NOT EXISTS idx_applications_vet_id ON applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at);

-- ========================================
-- RESTORE DATA (if backup had data)
-- ========================================
-- Note: Only uncomment if you had data in the old table and need to restore
-- This will only work if the old data had valid UUIDs stored as strings
-- INSERT INTO applications (id, demand_id, vet_id, message, status, applied_at, updated_at)
-- SELECT 
--   id,
--   demand_id::uuid,
--   vet_id::uuid,
--   message,
--   status,
--   applied_at,
--   updated_at
-- FROM applications_backup
-- WHERE demand_id IS NOT NULL AND vet_id IS NOT NULL;

-- ========================================
-- CLEANUP: Drop backup table (uncomment after verifying data)
-- ========================================
-- DROP TABLE IF EXISTS applications_backup;

