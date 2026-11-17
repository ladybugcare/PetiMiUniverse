-- Índice único parcial impede ON CONFLICT via PostgREST/supabase-js.
-- Troca por índice completo nas mesmas colunas (NULLs em plan_key continuam distintos no Postgres).
DROP INDEX IF EXISTS public.uniq_hub_boarding_tasks_plan_key_date;
CREATE UNIQUE INDEX uniq_hub_boarding_tasks_plan_key_date
  ON public.hub_boarding_tasks (hub_boarding_reservation_id, plan_key, task_date);
