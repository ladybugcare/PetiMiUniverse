-- PetMi Hub — por serviço principal, indica se cada adicional do grupo está disponível.
-- Pré-requisitos: alter_hub_service_types_is_addon.sql, create_hub_service_group_addons.sql

CREATE TABLE IF NOT EXISTS public.hub_service_type_addon_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  addon_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_service_type_addon_availability_unique UNIQUE (parent_service_type_id, addon_service_type_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_service_type_addon_availability_parent
  ON public.hub_service_type_addon_availability (parent_service_type_id);

DROP TRIGGER IF EXISTS update_hub_service_type_addon_availability_updated_at ON public.hub_service_type_addon_availability;
CREATE TRIGGER update_hub_service_type_addon_availability_updated_at
  BEFORE UPDATE ON public.hub_service_type_addon_availability
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_service_type_addon_availability IS
  'Disponibilidade de adicionais por serviço principal (interseção com hub_service_group_addons).';
