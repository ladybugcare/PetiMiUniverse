-- PetMi Hub — preferência de caso clínico ao agendar (fluxo «consulta de rotina» na agenda).
-- Consumida em POST /encounters/open-from-appointment e depois limpa no agendamento.
-- Pré-requisitos: hub_appointments, hub_clinical_cases.

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS intake_hub_case_id uuid REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intake_create_new_case boolean,
  ADD COLUMN IF NOT EXISTS intake_new_case_title text;

COMMENT ON COLUMN public.hub_appointments.intake_hub_case_id IS
  'Caso clínico a vincular ao abrir o atendimento a partir deste agendamento (opcional).';
COMMENT ON COLUMN public.hub_appointments.intake_create_new_case IS
  'Se true, força criação de novo caso ao abrir o atendimento (UI consulta de rotina).';
COMMENT ON COLUMN public.hub_appointments.intake_new_case_title IS
  'Título sugerido para o novo caso quando intake_create_new_case é true.';

CREATE INDEX IF NOT EXISTS idx_hub_appointments_intake_case
  ON public.hub_appointments (intake_hub_case_id)
  WHERE deleted_at IS NULL AND intake_hub_case_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
