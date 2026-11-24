-- PetMi Hub — biblioteca de termos clínicos (modelos PDF por clínica).
-- Pré-requisitos: clinics, moddatetime. Storage: bucket hub-clinical-files (path {clinicId}/terms/...).

CREATE TABLE IF NOT EXISTS public.hub_clinical_term_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('castracao', 'anestesia', 'internacao', 'eutanasia', 'outro')),
  description text,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT hub_clinical_term_templates_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT hub_clinical_term_templates_file_name_chk CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255)
);

COMMENT ON TABLE public.hub_clinical_term_templates IS
  'Modelos de termos clínicos (PDF) por clínica — baixar/mostrar; sem assinatura digital no MVP.';
COMMENT ON COLUMN public.hub_clinical_term_templates.storage_path IS
  'URL pública do arquivo no bucket hub-clinical-files (mesmo padrão de anexos clínicos).';
COMMENT ON COLUMN public.hub_clinical_term_templates.category IS
  'castracao | anestesia | internacao | eutanasia | outro';

CREATE INDEX IF NOT EXISTS idx_hub_clinical_term_templates_clinic_active
  ON public.hub_clinical_term_templates (clinic_id, is_active, sort_order, title)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_hub_clinical_term_templates_updated_at ON public.hub_clinical_term_templates;
CREATE TRIGGER set_hub_clinical_term_templates_updated_at
  BEFORE UPDATE ON public.hub_clinical_term_templates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
