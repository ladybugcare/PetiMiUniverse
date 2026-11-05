-- PetMi Hub — valor estimado em contas recorrentes (água, luz e outras que variam).
-- Pré-requisito: 117_create_hub_payable_schedules.sql.
-- amount_mode = estimated: o contrato guarda uma estimativa. A competência nasce
-- com amount_confirmed = false até a fatura ser informada.

ALTER TABLE public.hub_payable_schedules
  ADD COLUMN IF NOT EXISTS amount_mode text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.hub_payable_schedules
  DROP CONSTRAINT IF EXISTS hub_payable_schedules_amount_mode_check;

ALTER TABLE public.hub_payable_schedules
  ADD CONSTRAINT hub_payable_schedules_amount_mode_check
  CHECK (amount_mode IN ('fixed', 'estimated'));

ALTER TABLE public.hub_payables
  ADD COLUMN IF NOT EXISTS amount_confirmed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hub_payable_schedules.amount_mode IS
  'fixed = o valor do contrato é a obrigação; estimated = o valor é estimativa até a fatura.';

COMMENT ON COLUMN public.hub_payable_schedules.amount IS
  'Valor fixo da competência, ou estimativa quando amount_mode = estimated.';

COMMENT ON COLUMN public.hub_payables.amount_confirmed IS
  'false = valor ainda é estimativa da recorrência e não entra no total confirmado.';

NOTIFY pgrst, 'reload schema';
