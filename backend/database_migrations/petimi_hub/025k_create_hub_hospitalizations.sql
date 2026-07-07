-- Internação e leitos (Fase 5).

CREATE TABLE IF NOT EXISTS public.hub_hospital_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  code text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_hospital_beds_clinic_code
  ON public.hub_hospital_beds (clinic_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.hub_hospitalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  hub_hospital_bed_id uuid REFERENCES public.hub_hospital_beds(id) ON DELETE SET NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'cancelled')),
  admitted_at timestamptz NOT NULL DEFAULT now(),
  discharged_at timestamptz,
  admission_notes text,
  discharge_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.hub_hospitalization_daily_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES public.hub_hospitalizations(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  evolution_notes text NOT NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospitalization_id, note_date)
);

DROP TRIGGER IF EXISTS update_hub_hospital_beds_updated_at ON public.hub_hospital_beds;
CREATE TRIGGER update_hub_hospital_beds_updated_at
  BEFORE UPDATE ON public.hub_hospital_beds
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS update_hub_hospitalizations_updated_at ON public.hub_hospitalizations;
CREATE TRIGGER update_hub_hospitalizations_updated_at
  BEFORE UPDATE ON public.hub_hospitalizations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
