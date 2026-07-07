-- PetMi Hub — Banho & Tosa Fase 3: marcar linhas de agendamento como executadas no chão.
-- Pré-requisitos: hub_appointment_services (item 13), hub_staff_members.

ALTER TABLE public.hub_appointment_services
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_appt_services_executed
  ON public.hub_appointment_services (appointment_id)
  WHERE executed_at IS NOT NULL;

COMMENT ON COLUMN public.hub_appointment_services.executed_at IS 'Quando a linha foi concluída no operacional (Banho & Tosa).';
COMMENT ON COLUMN public.hub_appointment_services.executed_by_staff_id IS 'Profissional que marcou a linha como executada.';

NOTIFY pgrst, 'reload schema';
