-- Anexos / exames clínicos (Fase 4).

CREATE TABLE IF NOT EXISTS public.hub_clinical_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  title text,
  notes text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_attachments_pet
  ON public.hub_clinical_attachments (pet_id, uploaded_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.hub_clinical_attachments IS 'Metadados de anexos/exames clínicos (ficheiros no bucket hub-clinical-files).';

NOTIFY pgrst, 'reload schema';
