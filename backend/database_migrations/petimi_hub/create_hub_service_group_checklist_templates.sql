-- PetMi Hub — templates de checklist operacional por grupo de serviço (clínica/unidade).
-- Substitui o uso operacional de hub_grooming_checklist_templates (dados migrados abaixo).
-- Pré-requisitos: clinics, units (opcional), hub_service_groups, moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_service_group_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  service_group_slug text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_service_group_checklist_templates_slug_chk
    CHECK (service_group_slug ~ '^[a-z0-9_]{1,64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hub_service_group_checklist_clinic_unit_slug
  ON public.hub_service_group_checklist_templates (clinic_id, unit_id, service_group_slug)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_hub_service_group_checklist_clinic_slug
  ON public.hub_service_group_checklist_templates (clinic_id, service_group_slug)
  WHERE unit_id IS NULL;

COMMENT ON TABLE public.hub_service_group_checklist_templates IS
  'Itens de checklist operacional por grupo de serviço; merge com estado por sessão/atendimento.';

DROP TRIGGER IF EXISTS update_hub_service_group_checklist_templates_updated_at
  ON public.hub_service_group_checklist_templates;
CREATE TRIGGER update_hub_service_group_checklist_templates_updated_at
  BEFORE UPDATE ON public.hub_service_group_checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Migra templates legados de grooming (nível clínica) para banho_tosa.
INSERT INTO public.hub_service_group_checklist_templates (clinic_id, unit_id, service_group_slug, items, created_at, updated_at)
SELECT
  g.clinic_id,
  NULL::uuid AS unit_id,
  'banho_tosa'::text AS service_group_slug,
  g.items,
  g.created_at,
  g.updated_at
FROM public.hub_grooming_checklist_templates g
WHERE g.unit_id IS NULL
  AND jsonb_typeof(g.items) = 'array'
  AND jsonb_array_length(g.items) > 0
ON CONFLICT (clinic_id, unit_id, service_group_slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
