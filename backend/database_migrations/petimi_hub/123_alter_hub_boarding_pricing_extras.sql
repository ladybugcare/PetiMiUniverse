-- PetMi Hub — Hotel & Creche: preço ponta a ponta (Fase 1).
-- Snapshot do serviço/período na reserva + adicionais cobrados na comanda.
-- Pré-requisitos: 051_create_hub_boarding_reservations.sql, 003_create_hub_service_types.sql.

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL;

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS daycare_period text
    CHECK (daycare_period IS NULL OR daycare_period IN ('full_day', 'half_day'));

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS rate_source text
    CHECK (rate_source IS NULL OR rate_source IN ('appointment', 'service_type', 'manual'));

COMMENT ON COLUMN public.hub_boarding_reservations.hub_service_type_id IS
  'Serviço de hospedagem usado no preço. A linha deste serviço no agendamento não é somada de novo na comanda.';
COMMENT ON COLUMN public.hub_boarding_reservations.daycare_period IS
  'Creche: integral (full_day) ou meio período (half_day). Define o valor na matriz por período.';
COMMENT ON COLUMN public.hub_boarding_reservations.rate_source IS
  'Origem do daily_rate_cents: linha do agendamento, tipo de serviço ou ajuste manual da recepção.';

-- Estadias ativas por sobreposição de datas (painel do dia)
CREATE INDEX IF NOT EXISTS idx_hub_boarding_reservations_clinic_active
  ON public.hub_boarding_reservations (clinic_id, status, expected_check_out)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.hub_boarding_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  quantity numeric(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents integer NOT NULL DEFAULT 0 CHECK (unit_amount_cents >= 0),
  service_date date,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_extras_reservation
  ON public.hub_boarding_extras (hub_boarding_reservation_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_boarding_extras IS
  'Adicionais da estadia (banho no dia, horário extra, produtos). Viram linhas próprias na comanda.';

NOTIFY pgrst, 'reload schema';
