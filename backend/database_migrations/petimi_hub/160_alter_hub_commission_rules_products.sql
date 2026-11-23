-- PetMi Hub — comissão unificada: regras por serviço OU por produto de estoque.
-- Pré-requisitos: 038_create_hub_commission_rules.sql, 008_create_hub_inventory.sql.

ALTER TABLE public.hub_commission_rules
  ALTER COLUMN hub_service_type_id DROP NOT NULL;

ALTER TABLE public.hub_commission_rules
  ADD COLUMN IF NOT EXISTS hub_inventory_item_id uuid
    REFERENCES public.hub_inventory_items(id) ON DELETE CASCADE;

ALTER TABLE public.hub_commission_rules
  DROP CONSTRAINT IF EXISTS hub_commission_rules_target_check;

ALTER TABLE public.hub_commission_rules
  ADD CONSTRAINT hub_commission_rules_target_check CHECK (
    (hub_service_type_id IS NOT NULL AND hub_inventory_item_id IS NULL)
    OR (hub_service_type_id IS NULL AND hub_inventory_item_id IS NOT NULL)
  );

DROP INDEX IF EXISTS public.uniq_hub_commission_rules_clinic_service_active;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_commission_rules_clinic_service_active
  ON public.hub_commission_rules (clinic_id, hub_service_type_id)
  WHERE deleted_at IS NULL AND hub_service_type_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_commission_rules_clinic_product_active
  ON public.hub_commission_rules (clinic_id, hub_inventory_item_id)
  WHERE deleted_at IS NULL AND hub_inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_commission_rules_inventory_item
  ON public.hub_commission_rules (hub_inventory_item_id)
  WHERE deleted_at IS NULL AND hub_inventory_item_id IS NOT NULL;

COMMENT ON TABLE public.hub_commission_rules IS
  'Comissão por hub_service_type_id OU hub_inventory_item_id (exatamente um); cálculo sobre linhas de hub_receivable_lines.';

COMMENT ON COLUMN public.hub_inventory_items.generates_staff_commission IS
  'Depreciado: elegibilidade de comissão de produto passa por hub_commission_rules. Coluna mantida por compatibilidade; não usada no cálculo.';

NOTIFY pgrst, 'reload schema';
