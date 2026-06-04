-- PetMi Hub — múltiplos serviços por agendamento + recorrência.
-- Pré-requisitos: create_hub_appointments.sql já executada, função moddatetime disponível.
-- Idempotente: usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ── Tabela de séries de recorrência ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hub_appointment_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  /** 'daily' | 'weekly' | 'monthly' */
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly')),
  /** Número de dias/semanas/meses entre ocorrências. */
  interval_value int NOT NULL DEFAULT 1 CHECK (interval_value >= 1),
  /** Dias da semana para recorrência semanal (1=seg … 7=dom). */
  days_of_week int[] DEFAULT NULL,
  /** Dia do mês para recorrência mensal. */
  day_of_month int DEFAULT NULL CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  start_date date NOT NULL,
  until_date date DEFAULT NULL,
  occurrences int DEFAULT NULL CHECK (occurrences IS NULL OR occurrences >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_appointment_series_clinic
  ON public.hub_appointment_series (clinic_id);

COMMENT ON TABLE public.hub_appointment_series IS 'Regras de recorrência para séries de agendamentos.';

DROP TRIGGER IF EXISTS update_hub_appointment_series_updated_at ON public.hub_appointment_series;
CREATE TRIGGER update_hub_appointment_series_updated_at
  BEFORE UPDATE ON public.hub_appointment_series
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- ── Colunas novas em hub_appointments ───────────────────────────────────────
ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.hub_appointment_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_occurrence_date date;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_series_id
  ON public.hub_appointments (series_id)
  WHERE series_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.hub_appointments.title IS 'Título do agendamento (gerado ou editado pelo usuário).';
COMMENT ON COLUMN public.hub_appointments.description IS 'Observações/notas detalhadas (substitui notes progressivamente).';
COMMENT ON COLUMN public.hub_appointments.series_id IS 'Série de recorrência à qual este slot pertence.';
COMMENT ON COLUMN public.hub_appointments.series_occurrence_date IS 'Data original do slot (útil quando o slot foi movido dentro da série).';

-- ── Tabela N:M serviços por agendamento ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hub_appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.hub_appointments(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_appt_services_appointment
  ON public.hub_appointment_services (appointment_id, order_index);

COMMENT ON TABLE public.hub_appointment_services IS 'Serviços realizados num agendamento (N:M). O primeiro (order_index=0) espelha hub_appointments.hub_service_type_id.';
