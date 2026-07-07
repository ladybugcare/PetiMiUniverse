-- PetMi Hub — evolução de hub_packages (simples/combo, precificação derivada do catálogo).
-- Pré-requisitos: 045_create_hub_packages_and_subscriptions.sql, 074_create_hub_package_items.sql.

ALTER TABLE public.hub_packages
  ADD COLUMN IF NOT EXISTS package_kind text NOT NULL DEFAULT 'single'
    CHECK (package_kind IN ('single', 'combo')),
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'manual'
    CHECK (pricing_mode IN ('manual', 'catalog_sum')),
  ADD COLUMN IF NOT EXISTS catalog_subtotal numeric(14, 2) CHECK (catalog_subtotal IS NULL OR catalog_subtotal >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(6, 2) CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

-- Retrocompat: pacotes legados com hub_service_type_id viram single
UPDATE public.hub_packages
SET package_kind = 'single'
WHERE hub_service_type_id IS NOT NULL AND package_kind = 'single';

COMMENT ON COLUMN public.hub_packages.package_kind IS 'single = 1 serviço; combo = vários serviços via hub_package_items.';
COMMENT ON COLUMN public.hub_packages.pricing_mode IS 'manual = preço fixo; catalog_sum = derivado da soma dos serviços com desconto opcional.';

NOTIFY pgrst, 'reload schema';
