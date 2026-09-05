-- Medicação aplicada na consulta (cobrável via serviço + estoque opcional).
-- Executar depois de 025b (encounters), 003 (service_types), 008 (inventory) e 025i (vacinas).

CREATE TABLE IF NOT EXISTS public.hub_encounter_medication_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  hub_case_id uuid REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  service_name text NOT NULL,
  service_price numeric(12, 2) NOT NULL DEFAULT 0,
  hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  hub_inventory_lot_id uuid REFERENCES public.hub_inventory_lots(id) ON DELETE SET NULL,
  medication_name text,
  batch_number text,
  dose text,
  use_route text,
  quantity numeric(12, 3) NOT NULL DEFAULT 1,
  product_price numeric(12, 2),
  notes text,
  administered_at timestamptz NOT NULL DEFAULT now(),
  stock_movement_id uuid REFERENCES public.hub_stock_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_med_admin_encounter
  ON public.hub_encounter_medication_administrations (hub_encounter_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_med_admin_clinic_pet
  ON public.hub_encounter_medication_administrations (clinic_id, pet_id, administered_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_encounter_medication_administrations_updated_at
  ON public.hub_encounter_medication_administrations;
CREATE TRIGGER update_hub_encounter_medication_administrations_updated_at
  BEFORE UPDATE ON public.hub_encounter_medication_administrations
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
