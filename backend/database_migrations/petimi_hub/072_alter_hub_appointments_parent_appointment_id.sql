-- Blocos adicionais do agendamento: filhos do slot principal (mesmo dia/pacote).
-- Pré-requisito: 012_create_hub_appointments.sql

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS parent_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hub_appointments_parent_active
  ON public.hub_appointments (parent_appointment_id)
  WHERE deleted_at IS NULL AND parent_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.hub_appointments.parent_appointment_id IS
  'Agendamento principal quando este slot é um bloco adicional (serviços extras no mesmo pacote).';
