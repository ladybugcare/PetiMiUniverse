-- PetMi Hub — itens de pacote (serviços avulsos com quantidade).
-- Pré-requisitos: 045_create_hub_packages_and_subscriptions.sql, hub_service_types.

CREATE TABLE IF NOT EXISTS public.hub_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.hub_packages(id) ON DELETE CASCADE,
  hub_service_type_id uuid NOT NULL REFERENCES public.hub_service_types(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_package_items_package
  ON public.hub_package_items (package_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_package_items_package_service
  ON public.hub_package_items (package_id, hub_service_type_id);

COMMENT ON TABLE public.hub_package_items IS 'Composição do pacote: serviços avulsos e quantidades incluídas.';

NOTIFY pgrst, 'reload schema';
