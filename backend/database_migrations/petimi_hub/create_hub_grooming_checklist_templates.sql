-- PetMi Hub — template de checklist Banho & Tosa por clínica (Fase 3; opcional).
-- Se não houver linha, o backend usa checklist padrão em código.
-- Pré-requisitos: clinics, units (opcional), moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_grooming_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Padrão',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_grooming_checklist_templates_clinic
  ON public.hub_grooming_checklist_templates (clinic_id)
  WHERE unit_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_grooming_checklist_templates_clinic_unit
  ON public.hub_grooming_checklist_templates (clinic_id, unit_id)
  WHERE unit_id IS NOT NULL;

COMMENT ON TABLE public.hub_grooming_checklist_templates IS 'Itens de checklist operacional (chaves + rótulos); merge com estado em hub_grooming_sessions.checklist.';

DROP TRIGGER IF EXISTS update_hub_grooming_checklist_templates_updated_at ON public.hub_grooming_checklist_templates;
CREATE TRIGGER update_hub_grooming_checklist_templates_updated_at
  BEFORE UPDATE ON public.hub_grooming_checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
