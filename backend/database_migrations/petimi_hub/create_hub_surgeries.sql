-- Cirurgias (Fase 6).

CREATE TABLE IF NOT EXISTS public.hub_surgeries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  anesthesia_notes text,
  team_notes text,
  materials_notes text,
  post_op_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_surgeries_clinic_status
  ON public.hub_surgeries (clinic_id, status, scheduled_at)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_surgeries_updated_at ON public.hub_surgeries;
CREATE TRIGGER update_hub_surgeries_updated_at
  BEFORE UPDATE ON public.hub_surgeries
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
