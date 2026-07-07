-- PetMi Hub — tipos de serviço por clínica (Epic 3)
-- Pré-requisitos: `clinics`, função `moddatetime`.

CREATE TABLE IF NOT EXISTS public.hub_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  default_duration_minutes integer CHECK (default_duration_minutes IS NULL OR default_duration_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (clinic_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hub_service_types_clinic_active
  ON public.hub_service_types (clinic_id)
  WHERE deleted_at IS NULL AND active = true;

COMMENT ON TABLE public.hub_service_types IS 'Catálogo de serviços (consulta, banho, hotel, …) por clínica.';

DROP TRIGGER IF EXISTS update_hub_service_types_updated_at ON public.hub_service_types;
CREATE TRIGGER update_hub_service_types_updated_at
  BEFORE UPDATE ON public.hub_service_types
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
