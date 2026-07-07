-- Migration 64: documentos validáveis de solicitação de exame (EX-XXXX-XXXX)
CREATE TABLE IF NOT EXISTS hub_clinical_exam_order_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  hub_encounter_id uuid NOT NULL REFERENCES hub_encounters(id) ON DELETE CASCADE,
  exam_id uuid REFERENCES hub_clinical_exams(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('single', 'encounter_bundle')),
  version_no int NOT NULL DEFAULT 1,
  issued_by uuid REFERENCES hub_staff_members(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  validation_code text NOT NULL UNIQUE,
  public_token text NOT NULL UNIQUE,
  validation_url text,
  document_status text NOT NULL DEFAULT 'valid' CHECK (document_status IN ('valid', 'revoked', 'expired')),
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES hub_staff_members(id) ON DELETE SET NULL,
  revoke_reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_exam_order_docs_encounter
  ON hub_clinical_exam_order_documents (hub_encounter_id, scope, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_hub_exam_order_docs_exam
  ON hub_clinical_exam_order_documents (exam_id)
  WHERE exam_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_exam_order_docs_public_token
  ON hub_clinical_exam_order_documents (public_token);

CREATE TABLE IF NOT EXISTS hub_clinical_exam_order_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES hub_clinical_exam_order_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'viewed', 'pdf_downloaded', 'revoked', 'whatsapp_opened')
  ),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_ip text,
  actor_user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_exam_order_doc_events_doc
  ON hub_clinical_exam_order_document_events (document_id, created_at DESC);
