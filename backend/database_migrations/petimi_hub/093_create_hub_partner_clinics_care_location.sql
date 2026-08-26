-- PetMi Hub — clínicas parceiras (local de atendimento) + care_location em agenda/atendimento/exame.
-- Pré-requisitos: clinics, units, hub_appointments, hub_encounters, hub_clinical_exams.

-- ─── Catálogo de clínicas parceiras (escopo por clinic_id do vet) ─────────────

CREATE TABLE IF NOT EXISTS public.hub_partner_clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  address_line text,
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_partner_clinics_clinic_active
  ON public.hub_partner_clinics (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_partner_clinics IS
  'Clínicas parceiras onde o vet atende/examina; catálogo local do tenant (não é outro Hub).';
COMMENT ON COLUMN public.hub_partner_clinics.name IS 'Nome da clínica parceira (obrigatório).';

CREATE OR REPLACE FUNCTION public.set_hub_partner_clinics_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_hub_partner_clinics_updated_at ON public.hub_partner_clinics;
CREATE TRIGGER trg_hub_partner_clinics_updated_at
  BEFORE UPDATE ON public.hub_partner_clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_partner_clinics_updated_at();

-- ─── care_location em appointments ───────────────────────────────────────────

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS care_location_kind text NOT NULL DEFAULT 'own_unit',
  ADD COLUMN IF NOT EXISTS hub_partner_clinic_id uuid REFERENCES public.hub_partner_clinics(id) ON DELETE SET NULL;

ALTER TABLE public.hub_appointments
  DROP CONSTRAINT IF EXISTS hub_appointments_care_location_kind_check;

ALTER TABLE public.hub_appointments
  ADD CONSTRAINT hub_appointments_care_location_kind_check
  CHECK (care_location_kind IN ('own_unit', 'partner_clinic'));

ALTER TABLE public.hub_appointments
  DROP CONSTRAINT IF EXISTS hub_appointments_care_location_pair_check;

ALTER TABLE public.hub_appointments
  ADD CONSTRAINT hub_appointments_care_location_pair_check
  CHECK (
    (care_location_kind = 'own_unit' AND hub_partner_clinic_id IS NULL)
    OR
    (care_location_kind = 'partner_clinic' AND hub_partner_clinic_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_hub_appointments_clinic_partner
  ON public.hub_appointments (clinic_id, hub_partner_clinic_id)
  WHERE deleted_at IS NULL AND hub_partner_clinic_id IS NOT NULL;

COMMENT ON COLUMN public.hub_appointments.care_location_kind IS
  'own_unit: unidade própria; partner_clinic: clínica parceira (catálogo local).';
COMMENT ON COLUMN public.hub_appointments.hub_partner_clinic_id IS
  'FK para hub_partner_clinics quando care_location_kind = partner_clinic.';

-- ─── care_location em encounters ─────────────────────────────────────────────

ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS care_location_kind text NOT NULL DEFAULT 'own_unit',
  ADD COLUMN IF NOT EXISTS hub_partner_clinic_id uuid REFERENCES public.hub_partner_clinics(id) ON DELETE SET NULL;

ALTER TABLE public.hub_encounters
  DROP CONSTRAINT IF EXISTS hub_encounters_care_location_kind_check;

ALTER TABLE public.hub_encounters
  ADD CONSTRAINT hub_encounters_care_location_kind_check
  CHECK (care_location_kind IN ('own_unit', 'partner_clinic'));

ALTER TABLE public.hub_encounters
  DROP CONSTRAINT IF EXISTS hub_encounters_care_location_pair_check;

ALTER TABLE public.hub_encounters
  ADD CONSTRAINT hub_encounters_care_location_pair_check
  CHECK (
    (care_location_kind = 'own_unit' AND hub_partner_clinic_id IS NULL)
    OR
    (care_location_kind = 'partner_clinic' AND hub_partner_clinic_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_hub_encounters_clinic_partner
  ON public.hub_encounters (clinic_id, hub_partner_clinic_id)
  WHERE deleted_at IS NULL AND hub_partner_clinic_id IS NOT NULL;

COMMENT ON COLUMN public.hub_encounters.care_location_kind IS
  'own_unit: unidade própria; partner_clinic: clínica parceira (catálogo local).';
COMMENT ON COLUMN public.hub_encounters.hub_partner_clinic_id IS
  'FK para hub_partner_clinics quando care_location_kind = partner_clinic.';

-- ─── care_location em clinical exams ─────────────────────────────────────────

ALTER TABLE public.hub_clinical_exams
  ADD COLUMN IF NOT EXISTS care_location_kind text NOT NULL DEFAULT 'own_unit',
  ADD COLUMN IF NOT EXISTS hub_partner_clinic_id uuid REFERENCES public.hub_partner_clinics(id) ON DELETE SET NULL;

ALTER TABLE public.hub_clinical_exams
  DROP CONSTRAINT IF EXISTS hub_clinical_exams_care_location_kind_check;

ALTER TABLE public.hub_clinical_exams
  ADD CONSTRAINT hub_clinical_exams_care_location_kind_check
  CHECK (care_location_kind IN ('own_unit', 'partner_clinic'));

ALTER TABLE public.hub_clinical_exams
  DROP CONSTRAINT IF EXISTS hub_clinical_exams_care_location_pair_check;

ALTER TABLE public.hub_clinical_exams
  ADD CONSTRAINT hub_clinical_exams_care_location_pair_check
  CHECK (
    (care_location_kind = 'own_unit' AND hub_partner_clinic_id IS NULL)
    OR
    (care_location_kind = 'partner_clinic' AND hub_partner_clinic_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_hub_clinical_exams_clinic_partner
  ON public.hub_clinical_exams (clinic_id, hub_partner_clinic_id)
  WHERE deleted_at IS NULL AND hub_partner_clinic_id IS NOT NULL;

COMMENT ON COLUMN public.hub_clinical_exams.care_location_kind IS
  'own_unit: unidade própria; partner_clinic: clínica parceira. Herdado do encounter quando aplicável.';
COMMENT ON COLUMN public.hub_clinical_exams.hub_partner_clinic_id IS
  'FK para hub_partner_clinics quando care_location_kind = partner_clinic.';
