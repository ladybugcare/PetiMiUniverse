-- PetMi Hub — itens da comanda (pet por item; consumo contínuo via service_date).
-- Pré-requisitos: create_hub_comandas.sql, hub_service_types, hub_inventory_* (opcional).

CREATE TABLE IF NOT EXISTS public.hub_comanda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  comanda_id uuid NOT NULL REFERENCES public.hub_comandas(id) ON DELETE CASCADE,
  pet_id uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('service', 'product', 'fee')),
  hub_service_type_id uuid REFERENCES public.hub_service_types(id) ON DELETE SET NULL,
  hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  hub_inventory_lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  service_date date,
  origin_type text,
  origin_id uuid,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_comanda_items_comanda
  ON public.hub_comanda_items (comanda_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_hub_comanda_items_pet
  ON public.hub_comanda_items (pet_id)
  WHERE pet_id IS NOT NULL;

COMMENT ON COLUMN public.hub_comanda_items.pet_id IS 'Pet do item; NULL = item do tutor (taxa, produto sem pet).';

NOTIFY pgrst, 'reload schema';
