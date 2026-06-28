-- PetMi Hub — marca comanda enviada ao financeiro (leave_pending).
-- Pré-requisito: create_hub_comandas.sql

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS finance_handoff_at timestamptz;

COMMENT ON COLUMN public.hub_comandas.finance_handoff_at IS
  'Preenchido quando a comanda é enviada ao financeiro (checkout leave_pending). Bloqueia edição no caixa.';

NOTIFY pgrst, 'reload schema';
