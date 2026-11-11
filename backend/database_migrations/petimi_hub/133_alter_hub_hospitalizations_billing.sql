-- Internação: waive de faturação (paridade Banho/Clínica/Hotel).
-- Pré-requisitos: 025k/025s (hospitalizações), 110 (hub_appointment_id).

ALTER TABLE public.hub_hospitalizations
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

COMMENT ON COLUMN public.hub_hospitalizations.billing_waived_at IS
  'Quando preenchido, a internação sai da fila sem cobrança do Caixa (waive financeiro).';
COMMENT ON COLUMN public.hub_hospitalizations.billing_waive_reason IS
  'Motivo obrigatório do waive de cobrança da internação.';

NOTIFY pgrst, 'reload schema';
