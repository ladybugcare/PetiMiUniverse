-- Prescrições e vacinas (Fase 3 Clínica).

CREATE TABLE IF NOT EXISTS public.hub_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'cancelled')),
  notes text,
  prescribed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.hub_prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.hub_prescriptions(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  hub_inventory_item_id uuid REFERENCES public.hub_inventory_items(id) ON DELETE SET NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_prescriptions_clinic_pet
  ON public.hub_prescriptions (clinic_id, pet_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.hub_vaccination_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  vaccine_name text NOT NULL,
  batch_number text,
  administered_at date NOT NULL,
  next_dose_at date,
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_vaccination_records_pet
  ON public.hub_vaccination_records (pet_id, administered_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_prescriptions_updated_at ON public.hub_prescriptions;
CREATE TRIGGER update_hub_prescriptions_updated_at
  BEFORE UPDATE ON public.hub_prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS update_hub_vaccination_records_updated_at ON public.hub_vaccination_records;
CREATE TRIGGER update_hub_vaccination_records_updated_at
  BEFORE UPDATE ON public.hub_vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
