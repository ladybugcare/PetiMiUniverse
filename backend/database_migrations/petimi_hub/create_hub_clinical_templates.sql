-- Templates clínicos (Fase 7).

CREATE TABLE IF NOT EXISTS public.hub_clinical_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_kind text NOT NULL DEFAULT 'consultation' CHECK (template_kind IN (
    'consultation',
    'dermatology',
    'vaccination',
    'return_visit',
    'other'
  )),
  anamnesis jsonb NOT NULL DEFAULT '{}'::jsonb,
  physical_exam jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_templates_clinic
  ON public.hub_clinical_templates (clinic_id)
  WHERE deleted_at IS NULL AND active = true;

DROP TRIGGER IF EXISTS update_hub_clinical_templates_updated_at ON public.hub_clinical_templates;
CREATE TRIGGER update_hub_clinical_templates_updated_at
  BEFORE UPDATE ON public.hub_clinical_templates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
