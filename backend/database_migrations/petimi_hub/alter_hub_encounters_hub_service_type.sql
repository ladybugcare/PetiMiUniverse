-- PetMi Hub — coluna opcional em hub_encounters (denormalização / relatórios).
-- O backend resolve o tipo de serviço do atendimento via hub_appointments.hub_service_type_id
-- quando há hub_appointment_id; esta migration não é obrigatória para o Hub funcionar.
-- Pré-requisitos: create_hub_encounters.sql, tabela hub_service_types.

ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_encounters.hub_service_type_id IS
  'Tipo de serviço principal do episódio (ex.: novo atendimento sem agendamento). Com agendamento, o serviço continua em hub_appointments.';

CREATE INDEX IF NOT EXISTS idx_hub_encounters_hub_service_type_id
  ON public.hub_encounters (hub_service_type_id)
  WHERE deleted_at IS NULL AND hub_service_type_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
