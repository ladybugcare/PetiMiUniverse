-- Migration: Add date/time fields to demands
-- Date: 2025-10-28
-- Description: Adds demand_date, start_time, and duration_hours to demands table

-- Add date/time columns
ALTER TABLE demands 
ADD COLUMN IF NOT EXISTS demand_date date NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS duration_hours numeric(4,2) NOT NULL DEFAULT 8.0;

-- Update existing demands with default values
UPDATE demands 
SET demand_date = CURRENT_DATE,
    start_time = '09:00:00',
    duration_hours = 8.0
WHERE demand_date IS NULL;

-- Create index for better query performance on demand_date
CREATE INDEX IF NOT EXISTS idx_demands_demand_date ON demands(demand_date);

-- Verification query
-- SELECT id, title, category, demand_date, start_time, duration_hours FROM demands ORDER BY demand_date DESC LIMIT 5;

