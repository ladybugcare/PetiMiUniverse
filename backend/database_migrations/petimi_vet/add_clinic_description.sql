-- Add description column to clinics table
-- This allows clinics to provide a brief institutional description

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN clinics.description IS 'Descrição breve da clínica (opcional)';

-- No default value needed as this is optional

