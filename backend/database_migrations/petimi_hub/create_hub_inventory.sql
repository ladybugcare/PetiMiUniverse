-- PetMi Hub — inventário: fornecedores, fabricantes, itens, lotes e movimentos de stock.
-- Pré-requisitos: `clinics`, função `moddatetime`.
-- Quantidade em stock por item/lote = soma dos movimentos (sinais por `movement_type` na aplicação).

-- Fornecedores
CREATE TABLE IF NOT EXISTS public.hub_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text,
  phone text,
  email text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_suppliers_clinic ON public.hub_suppliers (clinic_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_suppliers IS 'Fornecedores por clínica (compras / entradas).';

DROP TRIGGER IF EXISTS update_hub_suppliers_updated_at ON public.hub_suppliers;
CREATE TRIGGER update_hub_suppliers_updated_at
  BEFORE UPDATE ON public.hub_suppliers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Fabricantes
CREATE TABLE IF NOT EXISTS public.hub_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_manufacturers_clinic ON public.hub_manufacturers (clinic_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_manufacturers IS 'Fabricantes de produtos por clínica.';

DROP TRIGGER IF EXISTS update_hub_manufacturers_updated_at ON public.hub_manufacturers;
CREATE TRIGGER update_hub_manufacturers_updated_at
  BEFORE UPDATE ON public.hub_manufacturers
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Itens de inventário (produto / medicamento / vacina)
CREATE TABLE IF NOT EXISTS public.hub_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'medication', 'vaccine')),
  ean text,
  name text NOT NULL,
  unit_label text,
  manufacturer_id uuid REFERENCES public.hub_manufacturers(id) ON DELETE SET NULL,
  allow_fractional boolean NOT NULL DEFAULT false,
  store_sku text,
  sale_purpose text,
  product_group text,
  default_supplier_id uuid REFERENCES public.hub_suppliers(id) ON DELETE SET NULL,
  description text,
  cost_amount numeric(12,2) NOT NULL CHECK (cost_amount >= 0),
  sale_amount numeric(12,2) NOT NULL CHECK (sale_amount >= 0),
  supplier_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (supplier_discount_pct >= 0 AND supplier_discount_pct <= 100),
  max_sale_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (max_sale_discount_pct >= 0 AND max_sale_discount_pct <= 100),
  allow_price_override_on_sale boolean NOT NULL DEFAULT false,
  generates_staff_commission boolean NOT NULL DEFAULT false,
  min_stock_qty numeric(14,4) NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  expiry_alert_policy text NOT NULL DEFAULT 'none' CHECK (expiry_alert_policy IN ('none', 'd30', 'd60', 'd90')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_inventory_items_clinic_ean_unique
  ON public.hub_inventory_items (clinic_id, ean)
  WHERE deleted_at IS NULL AND ean IS NOT NULL AND trim(ean) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_inventory_items_clinic_sku_unique
  ON public.hub_inventory_items (clinic_id, store_sku)
  WHERE deleted_at IS NULL AND store_sku IS NOT NULL AND trim(store_sku) <> '';

CREATE INDEX IF NOT EXISTS idx_hub_inventory_items_clinic_kind
  ON public.hub_inventory_items (clinic_id, item_kind)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_inventory_items IS 'Catálogo de stock: produtos, medicamentos e vacinas por clínica.';
COMMENT ON COLUMN public.hub_inventory_items.ean IS 'EAN-8 ou EAN-13 (validação de checksum na API).';
COMMENT ON COLUMN public.hub_inventory_items.expiry_alert_policy IS 'Alerta de vencimento: none, d30, d60, d90 (dias antes).';

DROP TRIGGER IF EXISTS update_hub_inventory_items_updated_at ON public.hub_inventory_items;
CREATE TRIGGER update_hub_inventory_items_updated_at
  BEFORE UPDATE ON public.hub_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Lotes (validade / número de lote)
CREATE TABLE IF NOT EXISTS public.hub_inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.hub_inventory_items(id) ON DELETE CASCADE,
  lot_code text,
  expiry_date date,
  received_at date NOT NULL DEFAULT (CURRENT_DATE),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_inventory_lots_item ON public.hub_inventory_lots (item_id);
CREATE INDEX IF NOT EXISTS idx_hub_inventory_lots_expiry ON public.hub_inventory_lots (clinic_id, expiry_date) WHERE expiry_date IS NOT NULL;

COMMENT ON TABLE public.hub_inventory_lots IS 'Lotes por item; quantidade actual vem dos movimentos.';

-- Movimentos (ledger)
CREATE TABLE IF NOT EXISTS public.hub_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.hub_inventory_items(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN (
    'initial_in',
    'purchase_in',
    'adjustment_in',
    'adjustment_out',
    'sale_out',
    'encounter_out'
  )),
  qty numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_cost numeric(12,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_stock_movements_clinic_item ON public.hub_stock_movements (clinic_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_stock_movements_lot ON public.hub_stock_movements (lot_id) WHERE lot_id IS NOT NULL;

COMMENT ON TABLE public.hub_stock_movements IS 'Movimentos de stock; sentido dado por movement_type (in soma, out subtrai na API).';
COMMENT ON COLUMN public.hub_stock_movements.reference_type IS 'Ex.: encounter (futuro); livre para integrações.';
COMMENT ON COLUMN public.hub_stock_movements.movement_type IS 'initial_in, purchase_in, adjustment_in somam; adjustment_out, sale_out, encounter_out subtraem.';
