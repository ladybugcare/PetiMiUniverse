-- Migration 63: campos de solicitação de exame (lab externo / encaminhamento)
ALTER TABLE hub_clinical_exams
  ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES hub_guardians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS urgency text CHECK (urgency IS NULL OR urgency IN ('routine', 'urgent')),
  ADD COLUMN IF NOT EXISTS clinical_indication text,
  ADD COLUMN IF NOT EXISTS fasting_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collection_instructions text,
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'draft'
    CHECK (document_status IN ('draft', 'active', 'issued', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_hub_clinical_exams_encounter_active
  ON hub_clinical_exams (hub_encounter_id, document_status)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN hub_clinical_exams.document_status IS
  'draft=editável; active=solicitado; issued=congelado após emissão de documento; cancelled=removido';
