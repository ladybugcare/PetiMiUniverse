-- PetMi Hub — Exames clínicos estruturados (Fase 4 Clínica).
-- Substitui o uso de hub_clinical_attachments como proxy de exame.
-- Pré-requisitos: create_hub_clinical_cases.sql, alter_hub_encounters_add_case.sql.

CREATE TABLE IF NOT EXISTS public.hub_clinical_exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE RESTRICT,
  hub_case_id uuid REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  exam_type text NOT NULL,
  lab_kind text NOT NULL DEFAULT 'internal'
    CHECK (lab_kind IN ('internal', 'external')),
  -- Laboratório interno
  lab_name text,
  -- Campos de laboratório externo (previstos desde a modelagem inicial)
  external_lab_name text,
  external_order_code text,
  external_result_url text,
  -- Status do exame no fluxo
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'collected', 'sent', 'result_received', 'completed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz,
  result_at timestamptz,
  result_text text,
  requested_by uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  -- Dados extras e integração futura (payloads de lab externo, referências, etc.)
  metadata jsonb NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_exams_clinic_pet
  ON public.hub_clinical_exams (clinic_id, pet_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_clinical_exams_clinic_case
  ON public.hub_clinical_exams (clinic_id, hub_case_id)
  WHERE deleted_at IS NULL AND hub_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_clinical_exams_clinic_status
  ON public.hub_clinical_exams (clinic_id, status)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_clinical_exams IS 'Exames clínicos como entidade de 1ª classe, com status, laboratório e resultado.';
COMMENT ON COLUMN public.hub_clinical_exams.lab_kind IS 'internal: laboratório interno da clínica; external: laboratório externo.';
COMMENT ON COLUMN public.hub_clinical_exams.external_lab_name IS 'Nome do laboratório externo (obrigatório quando lab_kind=external).';
COMMENT ON COLUMN public.hub_clinical_exams.external_order_code IS 'Código do pedido no sistema do laboratório externo.';
COMMENT ON COLUMN public.hub_clinical_exams.external_result_url IS 'URL do resultado no portal do laboratório externo.';
COMMENT ON COLUMN public.hub_clinical_exams.metadata IS 'Payload de integração futura: HL7, FHIR, APIs de laboratório.';

DROP TRIGGER IF EXISTS update_hub_clinical_exams_updated_at ON public.hub_clinical_exams;
CREATE TRIGGER update_hub_clinical_exams_updated_at
  BEFORE UPDATE ON public.hub_clinical_exams
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
