-- PetMi Hub — Audit trail por snapshot versionado (Fase 3 Clínica).
-- Cada finalização ou edição pós-finalização de um atendimento grava um snapshot
-- imutável do documento clínico completo. Não é ledger de diff; é snapshot full.
-- Pré-requisitos: create_hub_clinical_cases.sql, alter_hub_encounters_add_case.sql.

CREATE TABLE IF NOT EXISTS public.hub_clinical_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'encounter'
    CHECK (entity_type IN ('encounter')),
  entity_id uuid NOT NULL,
  version_no integer NOT NULL,
  document jsonb NOT NULL,
  changed_by uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hub_clinical_document_versions_entity_version_unique
    UNIQUE (entity_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_docver_entity
  ON public.hub_clinical_document_versions (entity_id, version_no DESC);

COMMENT ON TABLE public.hub_clinical_document_versions IS 'Snapshots versionados de documentos clínicos. Imutável após criação — nunca deletar ou atualizar linhas.';
COMMENT ON COLUMN public.hub_clinical_document_versions.entity_type IS 'Tipo da entidade: encounter (outros futuros: exam, prescription).';
COMMENT ON COLUMN public.hub_clinical_document_versions.document IS 'Snapshot completo do documento no momento da gravação (JSONB).';
COMMENT ON COLUMN public.hub_clinical_document_versions.change_reason IS 'Motivo da edição informado pelo usuário (obrigatório para edições pós-finalização).';
COMMENT ON COLUMN public.hub_clinical_document_versions.version_no IS 'Sequencial por entity_id. Versão 1 = finalização original; 2+ = edições posteriores.';

NOTIFY pgrst, 'reload schema';
