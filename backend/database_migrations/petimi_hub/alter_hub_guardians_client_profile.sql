-- PetMi Hub — estende `hub_guardians` com perfil de cliente (PF/PJ), morada e estado operacional.
-- Executar no Supabase SQL Editor após `create_hub_guardians.sql`.
-- LGPD: CPF/CNPJ e documentos são dados sensíveis; políticas de retenção e base legal ficam a cargo do produto.

ALTER TABLE public.hub_guardians
  ADD COLUMN IF NOT EXISTS client_kind text NOT NULL DEFAULT 'individual'
    CHECK (client_kind IN ('individual', 'company')),
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS sex text CHECK (sex IS NULL OR sex IN ('M', 'F', 'U')),
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS id_doc_type text,
  ADD COLUMN IF NOT EXISTS id_doc_number text,
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'active'
    CHECK (client_status IN ('active', 'inactive'));

COMMENT ON COLUMN public.hub_guardians.client_kind IS 'individual = tutor PF; company = cliente empresa (vários pets).';
COMMENT ON COLUMN public.hub_guardians.legal_name IS 'Razão social (PJ); opcional; full_name = nome fantasia/exibição.';
COMMENT ON COLUMN public.hub_guardians.tax_id IS 'CPF ou CNPJ sem formatação obrigatória no MVP.';
COMMENT ON COLUMN public.hub_guardians.client_status IS 'active|inactive operacional; arquivar permanece via deleted_at.';

CREATE INDEX IF NOT EXISTS idx_hub_guardians_clinic_kind
  ON public.hub_guardians (clinic_id, client_kind)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_guardians_clinic_status
  ON public.hub_guardians (clinic_id, client_status)
  WHERE deleted_at IS NULL;
