-- PetMi Hub — waive de faturação nas fontes + estado de faturação em orçamentos.
-- Pré-requisitos: create_hub_financial_core.sql, create_hub_grooming_sessions.sql, create_hub_encounters.sql, create_hub_prospects_and_quotes.sql.

ALTER TABLE public.hub_grooming_sessions
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

COMMENT ON COLUMN public.hub_grooming_sessions.billing_waived_at IS 'Sessão excluída da lista «sem cobrança» sem criar recebível (cortesia / política interna).';
COMMENT ON COLUMN public.hub_grooming_sessions.billing_waive_reason IS 'Motivo obrigatório na API ao fazer waive.';

ALTER TABLE public.hub_encounters
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

COMMENT ON COLUMN public.hub_encounters.billing_waived_at IS 'Encounter excluído da lista «sem cobrança» sem criar recebível.';
COMMENT ON COLUMN public.hub_encounters.billing_waive_reason IS 'Motivo obrigatório na API ao fazer waive.';

ALTER TABLE public.hub_quotes
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'none'
    CHECK (billing_state IN ('none', 'awaiting_billing', 'receivable_created')),
  ADD COLUMN IF NOT EXISTS billing_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_waive_reason text;

COMMENT ON COLUMN public.hub_quotes.billing_state IS 'none: antes de aceite operacional de faturação; awaiting_billing: aceite sem recebível; receivable_created: existe cobrança.';
COMMENT ON COLUMN public.hub_quotes.billing_waived_at IS 'Orçamento aceite excluído da fila de faturação sem recebível.';

UPDATE public.hub_quotes
SET billing_state = 'awaiting_billing'
WHERE status = 'accepted'
  AND billing_state = 'none'
  AND billing_waived_at IS NULL;

NOTIFY pgrst, 'reload schema';
