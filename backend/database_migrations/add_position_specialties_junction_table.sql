-- Migration: Add Position Specialties Junction Table
-- Date: 2025-10-29
-- Description: Creates a junction table to support multiple specialties per position

-- ========================================
-- 1. CREATE POSITION_SPECIALTIES TABLE
-- ========================================

CREATE TABLE IF NOT EXISTS position_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES demand_positions(id) ON DELETE CASCADE,
  specialty_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- ========================================
-- 2. CREATE INDEXES
-- ========================================

CREATE INDEX IF NOT EXISTS idx_position_specialties_position ON position_specialties(position_id);
CREATE INDEX IF NOT EXISTS idx_position_specialties_specialty ON position_specialties(specialty_name);

-- Composite index for unique constraint and faster lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_position_specialties_unique 
ON position_specialties(position_id, specialty_name);

-- ========================================
-- 3. MIGRATE EXISTING DATA
-- ========================================

-- Migrate existing single specialty to junction table
-- Only for positions that have a specialty value
INSERT INTO position_specialties (position_id, specialty_name)
SELECT id, specialty
FROM demand_positions
WHERE specialty IS NOT NULL AND specialty != ''
ON CONFLICT (position_id, specialty_name) DO NOTHING;

-- ========================================
-- 4. ADD COMMENTS
-- ========================================

COMMENT ON TABLE position_specialties IS 'Junction table supporting multiple specialties per position';
COMMENT ON COLUMN position_specialties.position_id IS 'Reference to the demand position';
COMMENT ON COLUMN position_specialties.specialty_name IS 'Name of the specialty required for this position';

-- ========================================
-- 5. UPDATE VIEW TO INCLUDE SPECIALTIES
-- ========================================

-- Drop and recreate the view to include specialties array
DROP VIEW IF EXISTS positions_with_availability;

CREATE OR REPLACE VIEW positions_with_availability AS
SELECT 
  dp.id,
  dp.master_demand_id,
  dp.specialty, -- Keep for backward compatibility
  COALESCE(
    (SELECT json_agg(ps.specialty_name)
     FROM position_specialties ps
     WHERE ps.position_id = dp.id),
    '[]'::json
  ) as specialties,
  dp.total_slots,
  dp.filled_slots,
  dp.individual_payment,
  dp.status,
  dp.description,
  dp.created_at,
  d.title,
  d.description as demand_description,
  d.clinic_id,
  d.unit_id,
  d.demand_date,
  d.start_time,
  d.end_time,
  d.category,
  (dp.total_slots - dp.filled_slots) as available_slots,
  CONCAT(dp.filled_slots, '/', dp.total_slots) as progress
FROM demand_positions dp
JOIN demands d ON d.id = dp.master_demand_id
WHERE dp.status = 'open' AND d.status = 'open';

-- ========================================
-- 6. VERIFICATION QUERIES
-- ========================================

-- Check table structure
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name = 'position_specialties'
-- ORDER BY ordinal_position;

-- Check indexes
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'position_specialties';

-- Check migrated data
-- SELECT dp.id, dp.specialty as old_specialty, 
--        json_agg(ps.specialty_name) as new_specialties
-- FROM demand_positions dp
-- LEFT JOIN position_specialties ps ON ps.position_id = dp.id
-- GROUP BY dp.id, dp.specialty;

