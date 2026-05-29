-- PetMi Hub — atendimentos clínicos (prontuário por episódio).
-- Pré-requisitos: clinics, units, hub_pets, hub_guardians, hub_staff_members, hub_appointments (opcional), moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  hub_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE SET NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  chief_complaint text,
  summary_notes text,
  anamnesis jsonb NOT NULL DEFAULT '{}'::jsonb,
  physical_exam jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_encounters_appointment_active
  ON public.hub_encounters (hub_appointment_id)
  WHERE hub_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_encounters_clinic_started
  ON public.hub_encounters (clinic_id, started_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_encounters_clinic_pet
  ON public.hub_encounters (clinic_id, pet_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_encounters IS 'Episódio clínico (atendimento médico); opcionalmente ligado a hub_appointments.';

DROP TRIGGER IF EXISTS update_hub_encounters_updated_at ON public.hub_encounters;
CREATE TRIGGER update_hub_encounters_updated_at
  BEFORE UPDATE ON public.hub_encounters
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
