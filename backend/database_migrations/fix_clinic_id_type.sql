-- Migration: Fix clinic_id type from bigint to uuid
-- Date: 2025-10-28
-- Description: Changes clinic_id column type to uuid to match the application requirements

-- Step 1: Check current type (for reference)
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'demands' AND column_name = 'clinic_id';

-- Step 2: If the table has data, you might need to clear it first or migrate the data
-- For development, if you can clear the table:
-- TRUNCATE TABLE demands CASCADE;

-- Step 3: Drop the existing clinic_id column
ALTER TABLE demands DROP COLUMN IF EXISTS clinic_id;

-- Step 4: Add clinic_id back as uuid with foreign key constraint
ALTER TABLE demands 
ADD COLUMN clinic_id uuid REFERENCES clinics(id);

-- Step 5: Make it NOT NULL if required (after ensuring data integrity)
-- ALTER TABLE demands ALTER COLUMN clinic_id SET NOT NULL;

-- Verification query
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'demands' AND column_name = 'clinic_id';

