-- PetMi Hub — permitir marcar agendamentos simples como sem cobrança.
-- Necessário porque agendamentos concluídos sem operação entram na fila "pendentes de cobrança".

ALTER TABLE public.hub_appointments
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

COMMENT ON COLUMN public.hub_appointments.billing_waived_at IS 'Agendamento simples excluído da fila de faturamento sem criar recebível.';
COMMENT ON COLUMN public.hub_appointments.billing_waive_reason IS 'Motivo obrigatório na API ao marcar sem cobrança.';

NOTIFY pgrst, 'reload schema';
