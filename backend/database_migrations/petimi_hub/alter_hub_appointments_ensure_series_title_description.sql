-- PetMi Hub — garantir colunas usadas pela API de agenda (title, description, recorrência).
--
-- Corrige no Supabase / PostgREST erros como:
--   "Could not find the 'description' column of 'hub_appointments' in the schema cache"
-- quando só correu `create_hub_appointments.sql` e ainda não `alter_hub_appointments_multi_service_and_recurrence.sql`.
--
-- Idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Pré-requisitos: `create_hub_appointments.sql`, função `moddatetime`, tabela `clinics`.
--
-- Depois de executar no SQL Editor: em alguns projetos o PostgREST actualiza o cache sozinho;
-- se o erro persistir alguns segundos, em Database → tentar "Reload schema" / ou
-- `NOTIFY pgrst, 'reload schema';` conforme a versão do Supabase.

-- ── Tabela de séries (necessária para FK de series_id) ───────────────────────
CREATE TABLE IF NOT EXISTS public.hub_appointment_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly')),
  interval_value int NOT NULL DEFAULT 1 CHECK (interval_value >= 1),
  days_of_week int[] DEFAULT NULL,
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

-- ── Colunas em hub_appointments ─────────────────────────────────────────────
ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.hub_appointment_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_occurrence_date date;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_series_id
  ON public.hub_appointments (series_id)
  WHERE series_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.hub_appointments.title IS 'Título do agendamento (gerado ou editado pelo usuário).';
COMMENT ON COLUMN public.hub_appointments.description IS 'Observações/notas detalhadas.';
COMMENT ON COLUMN public.hub_appointments.series_id IS 'Série de recorrência à qual este slot pertence.';
COMMENT ON COLUMN public.hub_appointments.series_occurrence_date IS 'Data original do slot na série.';
