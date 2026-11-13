-- PetMi Hub — status de saldo de pacote (P0: só usável após quitação do recebível).
-- pending: comprado, aguardando quitação (leave_pending / parcial)
-- active: recebível paid — sessões aplicáveis
-- voided: recebível cancelado / write-off

ALTER TABLE public.hub_customer_package_balances
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hub_customer_package_balances_status_check'
  ) THEN
    ALTER TABLE public.hub_customer_package_balances
      ADD CONSTRAINT hub_customer_package_balances_status_check
      CHECK (status IN ('pending', 'active', 'voided'));
  END IF;
END $$;

COMMENT ON COLUMN public.hub_customer_package_balances.status IS
  'pending = aguarda quitação do purchased_receivable_id; active = usável; voided = cancelado.';

-- Saldos ligados a recebível ainda não quitado passam a pending.
UPDATE public.hub_customer_package_balances b
SET status = 'pending'
FROM public.hub_receivables r
WHERE b.purchased_receivable_id = r.id
  AND r.status IS DISTINCT FROM 'paid'
  AND b.status = 'active'
  AND r.status IN ('pending', 'partially_paid');

UPDATE public.hub_customer_package_balances b
SET status = 'voided'
FROM public.hub_receivables r
WHERE b.purchased_receivable_id = r.id
  AND r.status IN ('cancelled', 'refunded')
  AND b.status IS DISTINCT FROM 'voided';

CREATE INDEX IF NOT EXISTS idx_hub_customer_package_balances_active_eligible
  ON public.hub_customer_package_balances (clinic_id, guardian_id, hub_service_type_id, expires_at)
  WHERE status = 'active' AND sessions_remaining > 0;
