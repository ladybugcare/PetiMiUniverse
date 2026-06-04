-- PetMi Hub — Documentos de receita versionados (Fase 5 Clínica).
-- Separa o dado clínico (hub_prescriptions) do documento emitido (hub_prescription_documents).
-- Pré-requisitos: create_hub_prescriptions_vaccinations.sql e create_hub_clinical_cases.sql.

-- 1. Adiciona hub_case_id às prescrições (se ainda não existir)
ALTER TABLE public.hub_prescriptions
  ADD COLUMN IF NOT EXISTS hub_case_id uuid
    REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_prescriptions.hub_case_id IS 'Caso clínico ao qual esta prescrição pertence.';

-- 2. Tabela de documentos de receita versionados
CREATE TABLE IF NOT EXISTS public.hub_prescription_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.hub_prescriptions(id) ON DELETE CASCADE,
  version_no integer NOT NULL DEFAULT 1,
  pdf_path text,
  issued_by uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  -- Placeholder para assinatura digital futura
  signature_status text NOT NULL DEFAULT 'none'
    CHECK (signature_status IN ('none', 'pending', 'signed')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_prescription_documents_unique_version
    UNIQUE (prescription_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_hub_prescription_docs_prescription
  ON public.hub_prescription_documents (prescription_id, version_no DESC);

COMMENT ON TABLE public.hub_prescription_documents IS 'Documentos de receita emitidos/versionados. Cada emissão do PDF gera uma linha nova com version_no incrementado.';
COMMENT ON COLUMN public.hub_prescription_documents.pdf_path IS 'Caminho do PDF no storage (null se ainda não gerado).';
COMMENT ON COLUMN public.hub_prescription_documents.signature_status IS 'none: sem assinatura; pending: assinatura solicitada; signed: assinado digitalmente.';

NOTIFY pgrst, 'reload schema';
