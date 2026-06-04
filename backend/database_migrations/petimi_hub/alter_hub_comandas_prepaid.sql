-- PetMi Hub — pagamento antecipado na comanda (Fase 1).
-- Pré-requisitos: create_hub_comandas.sql, create_hub_financial_core.sql (hub_payments).

-- Momento do pagamento: no fecho normal do checkout vs antecipado (antes da operação concluir).
ALTER TABLE public.hub_payments
  ADD COLUMN IF NOT EXISTS payment_timing text NOT NULL DEFAULT 'on_checkout'
    CHECK (payment_timing IN ('on_checkout', 'advance'));

COMMENT ON COLUMN public.hub_payments.payment_timing IS
  'on_checkout: pagamento no fecho habitual; advance: antecipado (comanda pode permanecer aberta até a operação).';

-- Estado financeiro da comanda (independente de status operacional da agenda/sessão/encounter).
ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'open'
    CHECK (financial_status IN ('open', 'awaiting_balance', 'balanced'));

COMMENT ON COLUMN public.hub_comandas.financial_status IS
  'open: sem saldo especial; awaiting_balance: há diferença a cobrar ou operação ainda em curso após antecipado; balanced: quitada em relação ao total atual.';

UPDATE public.hub_comandas SET financial_status = 'open' WHERE financial_status IS NULL;

NOTIFY pgrst, 'reload schema';
