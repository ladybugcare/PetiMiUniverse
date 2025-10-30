-- Migration: Fix position_applications column types
-- Date: 2025-10-29
-- Description: Converts bigint columns to uuid in position_applications table
-- Issue: Error "invalid input syntax for type bigint" when applying to positions

-- ========================================
-- BACKUP: Create backup of existing data (if any)
-- ========================================
CREATE TABLE IF NOT EXISTS position_applications_backup AS 
SELECT * FROM position_applications;

-- ========================================
-- DROP AND RECREATE: position_applications table with correct types
-- ========================================
DROP TABLE IF EXISTS position_applications CASCADE;

CREATE TABLE position_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  vet_id uuid NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 
    'accepted', 
    'rejected',
    'cancelled_by_vet',
    'inactive_accepted_other_position',
    'inactive_time_conflict'
  )),
  message text,
  accepted_at timestamp with time zone,
  inactive_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(position_id, vet_id)
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_position_applications_position ON position_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_vet ON position_applications(vet_id);
CREATE INDEX IF NOT EXISTS idx_position_applications_status ON position_applications(status);

-- ========================================
-- RESTORE DATA (if backup had data)
-- ========================================
-- Note: Only uncomment if you had data in the old table and need to restore
-- INSERT INTO position_applications 
-- SELECT * FROM position_applications_backup;

-- ========================================
-- CLEANUP: Drop backup table
-- ========================================
-- DROP TABLE IF EXISTS position_applications_backup;

-- ========================================
-- VERIFICATION
-- ========================================
-- Check table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'position_applications'
ORDER BY ordinal_position;

-- Verify constraints
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  col.attname AS column_name
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_attribute col ON col.attnum = ANY(con.conkey) AND col.attrelid = rel.oid
WHERE rel.relname = 'position_applications';

