-- PetMi Hub — vincula hub_clinical_attachments a hub_clinical_exams (Fase 4 Clínica).
-- Pré-requisito: create_hub_clinical_exams.sql já aplicado.

ALTER TABLE public.hub_clinical_attachments
  ADD COLUMN IF NOT EXISTS hub_exam_id uuid
    REFERENCES public.hub_clinical_exams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_clinical_attachments.hub_exam_id IS 'Exame ao qual este anexo pertence. NULL = anexo genérico do atendimento.';

NOTIFY pgrst, 'reload schema';
