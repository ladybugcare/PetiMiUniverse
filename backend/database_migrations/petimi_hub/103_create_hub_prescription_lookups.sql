-- Catálogo de receita por clínica (medicamento / apresentação / uso) + via de uso no item.
-- Não mistura com inventário: medicamentos prescritos são lista própria do veterinário.
-- Pré-requisito: `025i_create_hub_prescriptions_vaccinations.sql`, `058_alter_hub_prescription_items_mvp_fields.sql`, `clinics`, `moddatetime`.

CREATE TABLE IF NOT EXISTS public.hub_prescription_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('medication', 'presentation', 'use_route')),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_prescription_lookups_clinic_kind
  ON public.hub_prescription_lookups (clinic_id, kind)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_prescription_lookups_clinic_kind_label_unique
  ON public.hub_prescription_lookups (clinic_id, kind, lower(label))
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_prescription_lookups IS
  'Catálogo de opções de receita por clínica: medicamentos prescritos, apresentações e vias de uso.';
COMMENT ON COLUMN public.hub_prescription_lookups.kind IS
  'medication | presentation | use_route';
COMMENT ON COLUMN public.hub_prescription_lookups.label IS
  'Texto exibido e gravado no item da receita (snapshot).';

DROP TRIGGER IF EXISTS update_hub_prescription_lookups_updated_at ON public.hub_prescription_lookups;
CREATE TRIGGER update_hub_prescription_lookups_updated_at
  BEFORE UPDATE ON public.hub_prescription_lookups
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.hub_prescription_items
  ADD COLUMN IF NOT EXISTS use_route text;

COMMENT ON COLUMN public.hub_prescription_items.use_route IS
  'Via de uso (ex.: Oral, Tópico, Oftalmológico). Distinto de administration (casa vs clínica).';

NOTIFY pgrst, 'reload schema';
