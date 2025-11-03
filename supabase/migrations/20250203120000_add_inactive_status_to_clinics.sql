-- ========================================
-- Migration: Allow inactive status for clinics
-- ========================================

ALTER TABLE clinics
DROP CONSTRAINT IF EXISTS clinics_status_check;

ALTER TABLE clinics
ADD CONSTRAINT clinics_status_check
CHECK (
  status IN (
    'pending_unit',
    'pending_approval',
    'active',
    'suspended',
    'rejected',
    'inactive'
  )
);

