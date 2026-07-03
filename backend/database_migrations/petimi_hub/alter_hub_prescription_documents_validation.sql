-- Item 60: validação pública de receita (código, token, snapshot, hash)
ALTER TABLE public.hub_prescription_documents
  ADD COLUMN IF NOT EXISTS validation_code text,
  ADD COLUMN IF NOT EXISTS public_token text,
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'valid'
    CHECK (document_status IN ('valid', 'revoked', 'expired')),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS validation_url text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_prescription_documents_validation_code
  ON public.hub_prescription_documents (validation_code)
  WHERE validation_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_prescription_documents_public_token
  ON public.hub_prescription_documents (public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_prescription_documents_clinic_issued
  ON public.hub_prescription_documents (clinic_id, issued_at DESC);

COMMENT ON COLUMN public.hub_prescription_documents.validation_code IS 'Código legível RX-XXXX-XXXX para validação manual.';
COMMENT ON COLUMN public.hub_prescription_documents.public_token IS 'Token opaco na URL pública /receita/:token.';
COMMENT ON COLUMN public.hub_prescription_documents.snapshot IS 'Snapshot imutável no instante da emissão (pet, tutor, vet, itens).';
COMMENT ON COLUMN public.hub_prescription_documents.content_hash IS 'SHA-256 hex do snapshot canônico.';

NOTIFY pgrst, 'reload schema';
