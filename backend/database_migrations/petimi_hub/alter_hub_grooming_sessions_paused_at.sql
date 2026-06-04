-- PetMi Hub — Banho & Tosa: pausa operacional sem mudar `grooming_stage`.
-- Pré-requisito: `create_hub_grooming_sessions.sql` (eventos `pause` / `resume` já existem no CHECK).

ALTER TABLE public.hub_grooming_sessions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

COMMENT ON COLUMN public.hub_grooming_sessions.paused_at IS
  'Quando não nulo, o atendimento está pausado (ex.: intervalo). Estágio típico: in_service ou finishing.';

CREATE INDEX IF NOT EXISTS idx_hub_grooming_sessions_clinic_paused
  ON public.hub_grooming_sessions (clinic_id, paused_at)
  WHERE deleted_at IS NULL AND paused_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
