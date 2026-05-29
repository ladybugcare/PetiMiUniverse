-- PetMi Hub — distingue serviços principais de adicionais (catálogo na aba Adicionais).
-- Idempotente.

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_service_types.is_addon IS
  'true = adicional (não agendável sozinho); false = serviço principal.';

CREATE INDEX IF NOT EXISTS idx_hub_service_types_clinic_addon
  ON public.hub_service_types (clinic_id, is_addon)
  WHERE deleted_at IS NULL;
