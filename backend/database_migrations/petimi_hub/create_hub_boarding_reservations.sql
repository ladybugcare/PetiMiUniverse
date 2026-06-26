-- PetMi Hub — Reservas e logs diários de Hotel & Creche (Fases 2 e 3).
-- Pré-requisitos: clinics, units, hub_pets, hub_guardians, hub_appointments (opcional), moddatetime.
-- Executar no Supabase SQL Editor.

-- ─── hub_boarding_reservations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_boarding_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  guardian_id uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  hub_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('hotel', 'daycare')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN (
    'reserved',
    'checked_in',
    'checked_out',
    'cancelled',
    'no_show'
  )),
  expected_check_in timestamptz,
  expected_check_out timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  daily_rate_cents integer CHECK (daily_rate_cents IS NULL OR daily_rate_cents >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Garante no máximo uma reserva ativa por agendamento (espelho de grooming_sessions).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_boarding_reservations_appointment_active
  ON public.hub_boarding_reservations (hub_appointment_id)
  WHERE hub_appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_boarding_reservations_clinic_status
  ON public.hub_boarding_reservations (clinic_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_boarding_reservations_clinic_check_in
  ON public.hub_boarding_reservations (clinic_id, expected_check_in)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_boarding_reservations IS 'Execução operacional de Hotel & Creche; opcionalmente ligada a hub_appointments. Diárias calculadas a partir de checked_in_at/checked_out_at.';

-- Trigger de updated_at
DROP TRIGGER IF EXISTS update_hub_boarding_reservations_updated_at ON public.hub_boarding_reservations;
CREATE TRIGGER update_hub_boarding_reservations_updated_at
  BEFORE UPDATE ON public.hub_boarding_reservations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ─── hub_boarding_daily_logs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_boarding_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  -- Checklist do dia: jsonb com estrutura { done: boolean }
  fed jsonb,
  medication jsonb,
  walks jsonb,
  mood text,
  notes text,
  created_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Um log por dia por reserva (upsert seguro).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_boarding_daily_logs_reservation_date
  ON public.hub_boarding_daily_logs (hub_boarding_reservation_id, log_date);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_daily_logs_clinic_date
  ON public.hub_boarding_daily_logs (clinic_id, log_date DESC);

COMMENT ON TABLE public.hub_boarding_daily_logs IS 'Relatório diário de alimentação, medicação e passeios por estadia de Hotel & Creche.';

NOTIFY pgrst, 'reload schema';
