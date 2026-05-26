-- PetMi Hub — agendamentos (agenda: dia / semana / mês).
-- Pré-requisitos: `clinics`, `units`, `hub_service_types`, `hub_staff_members`, `hub_pets`, `hub_guardians`, função `moddatetime`.
-- Segurança: isolamento por `clinic_id` na API (service role); RLS opcional no Supabase conforme política do projeto.

CREATE TABLE IF NOT EXISTS public.hub_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN (
    'pending_confirm',
    'confirmed',
    'in_progress',
    'done',
    'cancelled',
    'paid'
  )),
  /** Texto livre (sala, mesa de tosa, van) até existir catálogo `hub_resources`. */
  resource_label text,
  notes text,
  /** standard | hotel_stay | daycare_block | pickup_route — agregações semana/mês (hotel, L&T). */
  appointment_kind text NOT NULL DEFAULT 'standard' CHECK (appointment_kind IN (
    'standard',
    'hotel_stay',
    'daycare_block',
    'pickup_route'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_appointments_time_chk CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_hub_appointments_clinic_starts
  ON public.hub_appointments (clinic_id, starts_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_clinic_staff_starts
  ON public.hub_appointments (clinic_id, hub_staff_member_id, starts_at)
  WHERE deleted_at IS NULL AND hub_staff_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_clinic_pet_starts
  ON public.hub_appointments (clinic_id, pet_id, starts_at)
  WHERE deleted_at IS NULL AND pet_id IS NOT NULL;

COMMENT ON TABLE public.hub_appointments IS 'Slots de agenda por clínica; staff opcional (não atribuído).';
COMMENT ON COLUMN public.hub_appointments.appointment_kind IS 'Hotel/creche/leva-e-traz vs atendimento pontual.';

DROP TRIGGER IF EXISTS update_hub_appointments_updated_at ON public.hub_appointments;
CREATE TRIGGER update_hub_appointments_updated_at
  BEFORE UPDATE ON public.hub_appointments
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Bloqueios / feriados / avisos de calendário por dia (visão mês).
CREATE TABLE IF NOT EXISTS public.hub_agenda_calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'closure' CHECK (kind IN ('holiday', 'closure', 'reduced_staff', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_agenda_calendar_blocks_kind_chk CHECK (kind IN ('holiday', 'closure', 'reduced_staff', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_agenda_calendar_blocks_clinic_day_active
  ON public.hub_agenda_calendar_blocks (clinic_id, block_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_agenda_calendar_blocks_clinic_date
  ON public.hub_agenda_calendar_blocks (clinic_id, block_date)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_agenda_calendar_blocks IS 'Marcadores de dia (feriado, fechamento, equipe reduzida) para a agenda mensal.';

DROP TRIGGER IF EXISTS update_hub_agenda_calendar_blocks_updated_at ON public.hub_agenda_calendar_blocks;
CREATE TRIGGER update_hub_agenda_calendar_blocks_updated_at
  BEFORE UPDATE ON public.hub_agenda_calendar_blocks
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
