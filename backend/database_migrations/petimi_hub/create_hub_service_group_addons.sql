-- PetMi Hub — universo de adicionais oferecidos por grupo de serviço (slug).
-- Pré-requisito: alter_hub_service_types_is_addon.sql

CREATE TABLE IF NOT EXISTS public.hub_service_group_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  service_group_slug text NOT NULL,
  addon_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_service_group_addons_slug_format CHECK (
    service_group_slug ~ '^[a-z0-9_]+$' AND length(service_group_slug) BETWEEN 1 AND 64
  ),
  CONSTRAINT hub_service_group_addons_unique UNIQUE (clinic_id, service_group_slug, addon_service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_service_group_addons_clinic_slug
  ON public.hub_service_group_addons (clinic_id, service_group_slug);

COMMENT ON TABLE public.hub_service_group_addons IS
  'Adicionais disponíveis para serviços de um grupo (extensão do catálogo hub_service_types.is_addon).';
