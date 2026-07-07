-- PetMi Hub — saldos de pacote por serviço (combo) e rastreio de compra.
-- Pré-requisitos: 045_create_hub_packages_and_subscriptions.sql, 074_create_hub_package_items.sql.

ALTER TABLE public.hub_customer_package_balances
  ADD COLUMN IF NOT EXISTS purchase_group_id uuid,
  ADD COLUMN IF NOT EXISTS hub_service_type_id uuid,
  ADD COLUMN IF NOT EXISTS package_item_id uuid,
  ADD COLUMN IF NOT EXISTS sessions_total integer CHECK (sessions_total IS NULL OR sessions_total > 0),
  ADD COLUMN IF NOT EXISTS comanda_id uuid,
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz;

-- FKs em bloco separado: ADD COLUMN IF NOT EXISTS não cria constraint se a coluna já existir
-- (PostgREST precisa da FK para embed hub_service_types em listActivePackageBalances).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_customer_package_balances_hub_service_type_id_fkey'
  ) THEN
    ALTER TABLE public.hub_customer_package_balances
      ADD CONSTRAINT hub_customer_package_balances_hub_service_type_id_fkey
      FOREIGN KEY (hub_service_type_id) REFERENCES public.hub_service_types(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_customer_package_balances_package_item_id_fkey'
  ) THEN
    ALTER TABLE public.hub_customer_package_balances
      ADD CONSTRAINT hub_customer_package_balances_package_item_id_fkey
      FOREIGN KEY (package_item_id) REFERENCES public.hub_package_items(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_customer_package_balances_comanda_id_fkey'
  ) THEN
    ALTER TABLE public.hub_customer_package_balances
      ADD CONSTRAINT hub_customer_package_balances_comanda_id_fkey
      FOREIGN KEY (comanda_id) REFERENCES public.hub_comandas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Retrocompat: preencher hub_service_type_id e sessions_total a partir do pacote legado
UPDATE public.hub_customer_package_balances b
SET
  hub_service_type_id = COALESCE(b.hub_service_type_id, p.hub_service_type_id),
  sessions_total = COALESCE(b.sessions_total, p.sessions_total),
  purchased_at = COALESCE(b.purchased_at, b.created_at)
FROM public.hub_packages p
WHERE b.package_id = p.id
  AND (b.hub_service_type_id IS NULL OR b.sessions_total IS NULL OR b.purchased_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_hub_customer_package_balances_lookup
  ON public.hub_customer_package_balances (clinic_id, guardian_id, hub_service_type_id, expires_at)
  WHERE sessions_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_hub_customer_package_balances_purchase_group
  ON public.hub_customer_package_balances (purchase_group_id)
  WHERE purchase_group_id IS NOT NULL;

COMMENT ON COLUMN public.hub_customer_package_balances.purchase_group_id IS 'Agrupa linhas de saldo de uma mesma compra (combo).';
COMMENT ON COLUMN public.hub_customer_package_balances.hub_service_type_id IS 'Serviço coberto por esta linha de saldo.';

NOTIFY pgrst, 'reload schema';
