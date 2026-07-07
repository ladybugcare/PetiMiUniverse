-- PetMi Hub — agrupa N agendamentos (1 por pet) na mesma visita do tutor.
-- Pré-requisito: 012_create_hub_appointments.sql

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS visit_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_visit_group
  ON public.hub_appointments (clinic_id, visit_group_id)
  WHERE visit_group_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.hub_appointments.visit_group_id IS
  'UUID compartilhado por agendamentos da mesma visita (vários pets do mesmo tutor no mesmo horário). NULL = avulso.';

NOTIFY pgrst, 'reload schema';
