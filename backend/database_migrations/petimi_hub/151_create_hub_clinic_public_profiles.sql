-- PetMi Hub — perfil público (landing) da clínica com opt-in.
-- Pré-requisitos: clinics, hub_service_types, hub_staff_members, função moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_clinic_public_profiles (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  public_slug text,
  headline text,
  about text,
  cover_image_url text,
  logo_override_url text,
  accent_color text,
  theme_preset text NOT NULL DEFAULT 'warm'
    CHECK (theme_preset IN ('warm', 'clean', 'dark')),
  whatsapp_phone text,
  show_phone boolean NOT NULL DEFAULT true,
  show_address boolean NOT NULL DEFAULT true,
  show_map boolean NOT NULL DEFAULT false,
  cta_label text,
  cta_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_clinic_public_profiles_slug_format_chk CHECK (
    public_slug IS NULL
    OR public_slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'
  ),
  CONSTRAINT hub_clinic_public_profiles_accent_chk CHECK (
    accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

COMMENT ON TABLE public.hub_clinic_public_profiles IS
  'Landing/portfólio público da clínica (opt-in). Sem enabled+slug a página responde 404.';
COMMENT ON COLUMN public.hub_clinic_public_profiles.public_slug IS
  'Slug legível na URL /c/:slug; único quando habilitado.';
COMMENT ON COLUMN public.hub_clinic_public_profiles.social_links IS
  'JSON: instagram, facebook, tiktok, youtube, site (URLs ou handles).';
COMMENT ON COLUMN public.hub_clinic_public_profiles.business_hours IS
  'JSON por dia 0–6 (dom–sáb): { closed, open, close } ou janelas.';

CREATE UNIQUE INDEX IF NOT EXISTS hub_clinic_public_profiles_slug_uq
  ON public.hub_clinic_public_profiles (public_slug)
  WHERE public_slug IS NOT NULL AND btrim(public_slug) <> '';

CREATE INDEX IF NOT EXISTS idx_hub_clinic_public_profiles_enabled
  ON public.hub_clinic_public_profiles (enabled)
  WHERE enabled = true;

DROP TRIGGER IF EXISTS update_hub_clinic_public_profiles_updated_at
  ON public.hub_clinic_public_profiles;
CREATE TRIGGER update_hub_clinic_public_profiles_updated_at
  BEFORE UPDATE ON public.hub_clinic_public_profiles
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

-- Visibilidade pública no catálogo de serviços
ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS show_on_public_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_blurb text,
  ADD COLUMN IF NOT EXISTS show_public_price boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hub_service_types.show_on_public_profile IS
  'Se true, o serviço aparece na landing pública da clínica.';
COMMENT ON COLUMN public.hub_service_types.public_blurb IS
  'Texto curto opcional na landing (senão usa description).';
COMMENT ON COLUMN public.hub_service_types.show_public_price IS
  'Se true, pode expor sale_amount na landing (nunca cost_amount).';

CREATE INDEX IF NOT EXISTS idx_hub_service_types_public_profile
  ON public.hub_service_types (clinic_id, public_sort_order)
  WHERE deleted_at IS NULL AND active = true AND show_on_public_profile = true;

-- Visibilidade pública na equipe
ALTER TABLE public.hub_staff_members
  ADD COLUMN IF NOT EXISTS show_on_public_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_bio text,
  ADD COLUMN IF NOT EXISTS public_sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hub_staff_members.show_on_public_profile IS
  'Se true, o profissional aparece na landing pública.';
COMMENT ON COLUMN public.hub_staff_members.public_bio IS
  'Bio pública (não usa internal_notes).';

CREATE INDEX IF NOT EXISTS idx_hub_staff_members_public_profile
  ON public.hub_staff_members (clinic_id, public_sort_order)
  WHERE deleted_at IS NULL AND active = true AND show_on_public_profile = true;
