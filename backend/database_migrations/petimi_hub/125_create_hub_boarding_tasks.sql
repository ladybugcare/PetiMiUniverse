-- PetMi Hub — Hotel & Creche: tarefas programadas e execuções (Fase 3).
-- Substitui a escrita em hub_boarding_daily_logs (que vira só histórico legado).
-- Pré-requisitos: 124_create_hub_boarding_care.sql, moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_boarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('feeding', 'medication', 'walk', 'recreation', 'custom')),
  source text NOT NULL DEFAULT 'plan' CHECK (source IN ('plan', 'manual', 'batch')),
  title text NOT NULL,
  -- Instruções do plano (quantidade, dose, ração, observações)
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  task_date date NOT NULL,
  -- Chave estável do item do plano (ex.: feeding:0:08:00). Nula para tarefas avulsas.
  plan_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  outcome text CHECK (outcome IS NULL OR outcome IN (
    'ate_all', 'ate_partial', 'refused',
    'given', 'not_given',
    'done', 'not_done'
  )),
  last_notes text,
  executed_at timestamptz,
  executed_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_boarding_tasks_plan_key_date
  ON public.hub_boarding_tasks (hub_boarding_reservation_id, plan_key, task_date)
  WHERE plan_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_boarding_tasks_clinic_date
  ON public.hub_boarding_tasks (clinic_id, task_date, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_tasks_reservation
  ON public.hub_boarding_tasks (hub_boarding_reservation_id, task_date);

DROP TRIGGER IF EXISTS update_hub_boarding_tasks_updated_at ON public.hub_boarding_tasks;
CREATE TRIGGER update_hub_boarding_tasks_updated_at
  BEFORE UPDATE ON public.hub_boarding_tasks
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_boarding_tasks IS
  'Atividades programadas da estadia (refeição, medicação, passeio, recreação, avulsa). Geradas a partir do plano de cuidados.';

CREATE TABLE IF NOT EXISTS public.hub_boarding_task_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_task_id uuid NOT NULL REFERENCES public.hub_boarding_tasks(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  -- outcome NULL + undone = true: registro desfeito (a tarefa voltou a pendente)
  outcome text,
  undone boolean NOT NULL DEFAULT false,
  notes text,
  batch_id uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  executed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_task_executions_task
  ON public.hub_boarding_task_executions (hub_boarding_task_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_task_executions_reservation
  ON public.hub_boarding_task_executions (hub_boarding_reservation_id, executed_at DESC);

COMMENT ON TABLE public.hub_boarding_task_executions IS
  'Histórico de registros das tarefas: quem fez, quando e o resultado. Alimenta linha do tempo e relatório ao tutor.';

NOTIFY pgrst, 'reload schema';
