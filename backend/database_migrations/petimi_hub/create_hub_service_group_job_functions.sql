-- PetMi Hub — funções principais (job_title) permitidas por grupo de serviço.
-- Pré-requisitos: `clinics`, `hub_service_groups` (slug alinhado a `hub_service_types.service_group`).
-- Inclui catch-up de `description` e `archived_at` (ver também alter_hub_service_groups_archived_at.sql).

ALTER TABLE public.hub_service_groups
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.hub_service_groups
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.hub_service_groups.archived_at IS
  'Quando preenchido, o grupo não aparece em comboboxes de novo serviço.';

CREATE INDEX IF NOT EXISTS idx_hub_service_groups_clinic_active
  ON public.hub_service_groups (clinic_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.hub_service_groups.description IS 'Descrição opcional do grupo (Configurações de serviços).';

CREATE TABLE IF NOT EXISTS public.hub_service_group_job_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  service_group_slug text NOT NULL,
  job_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_sg_job_fn_slug_format CHECK (service_group_slug ~ '^[a-z0-9_]+$' AND length(service_group_slug) BETWEEN 1 AND 64),
  CONSTRAINT hub_sg_job_fn_title_len CHECK (length(trim(job_title)) BETWEEN 1 AND 200),
  CONSTRAINT hub_sg_job_fn_unique UNIQUE (clinic_id, service_group_slug, job_title)
);

CREATE INDEX IF NOT EXISTS idx_hub_sg_job_fn_clinic_slug
  ON public.hub_service_group_job_functions (clinic_id, service_group_slug);

COMMENT ON TABLE public.hub_service_group_job_functions IS 'Funções principais (job_title da equipe) que podem realizar serviços de cada grupo.';

DROP TRIGGER IF EXISTS update_hub_service_group_job_functions_updated_at ON public.hub_service_group_job_functions;
CREATE TRIGGER update_hub_service_group_job_functions_updated_at
  BEFORE UPDATE ON public.hub_service_group_job_functions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
