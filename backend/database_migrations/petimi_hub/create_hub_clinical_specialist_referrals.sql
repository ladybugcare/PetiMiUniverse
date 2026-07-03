-- Migration 65: encaminhamentos a especialista
CREATE TABLE IF NOT EXISTS hub_clinical_specialist_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES hub_pets(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES hub_encounters(id) ON DELETE SET NULL,
  hub_case_id uuid REFERENCES hub_clinical_cases(id) ON DELETE SET NULL,
  guardian_id uuid REFERENCES hub_guardians(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES hub_staff_members(id) ON DELETE SET NULL,
  specialty text NOT NULL,
  specialist_name text,
  specialist_contact text,
  referral_reason text NOT NULL,
  clinical_summary text,
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'issued', 'cancelled')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_specialist_referrals_encounter
  ON hub_clinical_specialist_referrals (hub_encounter_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_specialist_referrals_pet
  ON hub_clinical_specialist_referrals (pet_id, clinic_id)
  WHERE deleted_at IS NULL;
