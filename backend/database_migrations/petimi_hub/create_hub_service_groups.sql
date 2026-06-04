-- PetMi Hub — grupos de serviço por clínica (nome, slug, cor na agenda).
-- Executar após `create_hub_service_types.sql` e `alter_hub_service_types_catalog.sql`.
-- `hub_service_types.service_group` continua a ser texto (slug); a cor vem desta tabela quando existir linha com o mesmo slug.

CREATE TABLE IF NOT EXISTS public.hub_service_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT '#f0642f',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_service_groups_slug_format CHECK (slug ~ '^[a-z0-9_]+$' AND length(slug) BETWEEN 1 AND 64),
  CONSTRAINT hub_service_groups_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT hub_service_groups_clinic_slug_unique UNIQUE (clinic_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_hub_service_groups_clinic
  ON public.hub_service_groups (clinic_id);

COMMENT ON TABLE public.hub_service_groups IS 'Grupos de serviço por clínica (slug alinhado a hub_service_types.service_group; cor na agenda).';

DROP TRIGGER IF EXISTS update_hub_service_groups_updated_at ON public.hub_service_groups;
CREATE TRIGGER update_hub_service_groups_updated_at
  BEFORE UPDATE ON public.hub_service_groups
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
