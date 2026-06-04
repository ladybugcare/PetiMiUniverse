-- PetMi Hub — Fase 2: cancelamento operacional vs resolução financeira na comanda.
-- Pré-requisitos: create_hub_comandas.sql, alter_hub_comandas_prepaid.sql.

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS cancellation_pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_operational_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_operational_type text
    CHECK (
      cancellation_operational_type IS NULL
      OR cancellation_operational_type IN ('appointment', 'grooming_session', 'encounter', 'quote')
    ),
  ADD COLUMN IF NOT EXISTS cancellation_operational_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_resolution text
    CHECK (
      cancellation_resolution IS NULL
      OR cancellation_resolution IN ('refund', 'customer_credit', 'keep_billing')
    ),
  ADD COLUMN IF NOT EXISTS cancellation_resolution_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_resolved_by_user_id uuid;

COMMENT ON COLUMN public.hub_comandas.cancellation_pending_at IS
  'Pendência financeira após cancelamento operacional com pagamento na comanda; resolvida no Caixa.';
COMMENT ON COLUMN public.hub_comandas.cancellation_operational_type IS
  'Origem do cancelamento operacional: appointment, grooming_session, encounter ou quote.';
COMMENT ON COLUMN public.hub_comandas.cancellation_resolution IS
  'Resolução no Caixa: refund, customer_credit ou keep_billing.';

CREATE INDEX IF NOT EXISTS idx_hub_comandas_cancellation_pending_queue
  ON public.hub_comandas (clinic_id, unit_id)
  WHERE cancellation_pending_at IS NOT NULL
    AND cancellation_resolved_at IS NULL
    AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
