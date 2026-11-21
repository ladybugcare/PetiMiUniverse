-- PetMi Hub — página pública: modo de exibição (grupos / serviços / ambos)
-- + flags de visibilidade em hub_service_groups.
-- Pré-requisitos: 017_create_hub_service_groups.sql, 151_create_hub_clinic_public_profiles.sql.

ALTER TABLE public.hub_clinic_public_profiles
  ADD COLUMN IF NOT EXISTS services_display_mode text NOT NULL DEFAULT 'services';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hub_clinic_public_profiles_services_display_mode_chk'
  ) THEN
    ALTER TABLE public.hub_clinic_public_profiles
      ADD CONSTRAINT hub_clinic_public_profiles_services_display_mode_chk
      CHECK (services_display_mode IN ('groups', 'services', 'both'));
  END IF;
END $$;

COMMENT ON COLUMN public.hub_clinic_public_profiles.services_display_mode IS
  'Como a landing lista a oferta: groups = só grupos; services = só tipos; both = grupos com serviços.';

ALTER TABLE public.hub_service_groups
  ADD COLUMN IF NOT EXISTS show_on_public_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_blurb text;

COMMENT ON COLUMN public.hub_service_groups.show_on_public_profile IS
  'Se true, o grupo aparece na landing pública (conforme services_display_mode).';
COMMENT ON COLUMN public.hub_service_groups.public_blurb IS
  'Texto curto opcional na landing (senão usa description).';

CREATE INDEX IF NOT EXISTS idx_hub_service_groups_public_profile
  ON public.hub_service_groups (clinic_id, public_sort_order)
  WHERE show_on_public_profile = true AND archived_at IS NULL;
