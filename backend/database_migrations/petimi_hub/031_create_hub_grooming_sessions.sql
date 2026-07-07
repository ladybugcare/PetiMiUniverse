-- PetMi Hub — sessões operacionais Banho & Tosa (Fase 2).
-- Pré-requisitos: clinics, units, hub_pets, hub_guardians, hub_staff_members, hub_appointments (opcional), moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_grooming_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  hub_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE SET NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  grooming_stage text NOT NULL DEFAULT 'scheduled' CHECK (grooming_stage IN (
    'scheduled',
    'checked_in',
    'queued',
    'in_service',
    'finishing',
    'ready',
    'delivered',
    'closed'
  )),
  priority smallint NOT NULL DEFAULT 0,
  checked_in_at timestamptz,
  started_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  tutor_notes_snapshot text,
  operational_notes text,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_grooming_sessions_appointment_active
  ON public.hub_grooming_sessions (hub_appointment_id)
  WHERE hub_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_grooming_sessions_clinic_checked_in
  ON public.hub_grooming_sessions (clinic_id, checked_in_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_grooming_sessions_clinic_stage
  ON public.hub_grooming_sessions (clinic_id, grooming_stage)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_grooming_sessions IS 'Execução operacional Banho & Tosa; opcionalmente ligada a hub_appointments.';

CREATE TABLE IF NOT EXISTS public.hub_grooming_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_grooming_session_id uuid NOT NULL REFERENCES public.hub_grooming_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'check_in',
    'start',
    'pause',
    'resume',
    'staff_change',
    'stage_change',
    'note',
    'ready',
    'delivered',
    'closed'
  )),
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_grooming_events_session_at
  ON public.hub_grooming_events (hub_grooming_session_id, created_at DESC);

COMMENT ON TABLE public.hub_grooming_events IS 'Timeline operacional da sessão de Banho & Tosa.';

DROP TRIGGER IF EXISTS update_hub_grooming_sessions_updated_at ON public.hub_grooming_sessions;
CREATE TRIGGER update_hub_grooming_sessions_updated_at
  BEFORE UPDATE ON public.hub_grooming_sessions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
