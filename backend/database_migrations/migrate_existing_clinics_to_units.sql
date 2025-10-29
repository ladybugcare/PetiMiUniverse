-- Migration Script: Create main units for existing clinics
-- Date: 2025-10-29
-- Description: This script creates a main unit for each existing clinic
--              and migrates them to the multi-unit system

-- ========================================
-- STEP 1: Create main units for all existing clinics
-- ========================================
INSERT INTO units (clinic_id, name, cnpj, address, city, state, phone, technical_manager, is_main, status)
SELECT 
  id as clinic_id,
  name || ' - Unidade Principal' as name,
  cnpj,
  COALESCE(address, 'Endereço não cadastrado') as address,
  COALESCE(city, 'Cidade não cadastrada') as city,
  COALESCE(state, 'SP') as state,
  phone,
  technical_manager,
  true as is_main,
  'active' as status
FROM clinics
WHERE id NOT IN (SELECT DISTINCT clinic_id FROM units WHERE is_main = true);

-- ========================================
-- STEP 2: Create CADMIN clinic_user entries for clinic owners
-- ========================================
-- This assumes the clinic owner's user_id is the same as the clinic's id
-- Adjust if your schema is different
INSERT INTO clinic_users (user_id, clinic_id, unit_id, role, status, accepted_at)
SELECT 
  c.id as user_id,
  c.id as clinic_id,
  u.id as unit_id,
  'CADMIN' as role,
  'active' as status,
  now() as accepted_at
FROM clinics c
JOIN units u ON u.clinic_id = c.id AND u.is_main = true
WHERE NOT EXISTS (
  SELECT 1 FROM clinic_users cu 
  WHERE cu.user_id = c.id AND cu.clinic_id = c.id
);

-- ========================================
-- STEP 3: Update existing demands to link to main unit
-- ========================================
UPDATE demands d
SET unit_id = u.id
FROM units u
WHERE d.clinic_id = u.clinic_id 
  AND u.is_main = true
  AND d.unit_id IS NULL;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================
-- Check that all clinics have a main unit
-- SELECT c.id, c.name, u.id as unit_id, u.name as unit_name
-- FROM clinics c
-- LEFT JOIN units u ON c.id = u.clinic_id AND u.is_main = true
-- WHERE u.id IS NULL;

-- Check that all clinic owners have CADMIN role
-- SELECT c.id, c.name, cu.role
-- FROM clinics c
-- LEFT JOIN clinic_users cu ON c.id = cu.clinic_id AND cu.role = 'CADMIN'
-- WHERE cu.id IS NULL;

-- Check that all demands are linked to a unit
-- SELECT d.id, d.title, d.clinic_id, d.unit_id
-- FROM demands d
-- WHERE d.unit_id IS NULL;

