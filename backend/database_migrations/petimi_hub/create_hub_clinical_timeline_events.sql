-- PetMi Hub — Timeline canônica de eventos clínicos (Fase 2 Clínica).
-- Ledger append-only; eventos são imutáveis após criação (deleted_at apenas para ocultação).
-- Pré-requisitos: create_hub_clinical_cases.sql e alter_hub_encounters_add_case.sql já aplicados.
--
-- Tipos de evento suportados:
--   encounter_created        — atendimento aberto
--   encounter_completed      — atendimento finalizado
--   encounter_amended        — atendimento editado após finalização
--   exam_requested           — exame solicitado
--   exam_result_received     — resultado de exame recebido
--   prescription_issued      — prescrição/receita emitida
--   vaccination_applied      — vacina aplicada
--   hospitalization_started  — internação iniciada
--   hospitalization_discharged — alta de internação
--   surgery_performed        — cirurgia realizada
--   return_scheduled         — retorno agendado
--   note                     — nota clínica manual

CREATE TABLE IF NOT EXISTS public.hub_clinical_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_case_id uuid REFERENCES public.hub_clinical_cases(id) ON DELETE SET NULL,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'encounter_created',
    'encounter_completed',
    'encounter_amended',
    'exam_requested',
    'exam_result_received',
    'prescription_issued',
    'vaccination_applied',
    'hospitalization_started',
    'hospitalization_discharged',
    'surgery_performed',
    'return_scheduled',
    'note'
  )),
  -- Referência genérica à entidade de origem
  ref_type text,  -- 'encounter' | 'exam' | 'prescription' | 'vaccination' | 'hospitalization' | 'surgery'
  ref_id uuid,
  title text NOT NULL,
  body text,
  event_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_clinical_tl_clinic_pet
  ON public.hub_clinical_timeline_events (clinic_id, pet_id, event_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_clinical_tl_clinic_case
  ON public.hub_clinical_timeline_events (clinic_id, hub_case_id, event_at DESC)
  WHERE deleted_at IS NULL AND hub_case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hub_clinical_tl_encounter
  ON public.hub_clinical_timeline_events (hub_encounter_id)
  WHERE deleted_at IS NULL AND hub_encounter_id IS NOT NULL;

COMMENT ON TABLE public.hub_clinical_timeline_events IS 'Ledger append-only de marcos clínicos relevantes. NÃO registra autosave, micro-edições ou alterações técnicas.';
COMMENT ON COLUMN public.hub_clinical_timeline_events.ref_type IS 'Tipo da entidade de origem: encounter, exam, prescription, vaccination, hospitalization, surgery.';
COMMENT ON COLUMN public.hub_clinical_timeline_events.ref_id IS 'ID da entidade de origem (uuid da tabela referenciada por ref_type).';

NOTIFY pgrst, 'reload schema';
