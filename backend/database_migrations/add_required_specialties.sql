-- Migration: Add required_specialties field to demands table
-- Date: 2025-10-28
-- Description: Adds required_specialties array field to store selected specialties for each demand

-- Add required_specialties column as a text array
ALTER TABLE demands
ADD COLUMN IF NOT EXISTS required_specialties text[] NOT NULL DEFAULT '{}';

-- Create index for better query performance when filtering by specialties
CREATE INDEX IF NOT EXISTS idx_demands_required_specialties ON demands USING GIN (required_specialties);

-- Verification query (run this to check if migration was successful)
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'demands' AND column_name = 'required_specialties';

