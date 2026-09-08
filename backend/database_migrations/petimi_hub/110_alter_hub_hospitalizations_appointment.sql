-- Espelho Consultório → Agenda: internação vinculada a slot de admissão.
-- Pré-requisitos: 025k/025s (hospitalizações), 012 (appointments), 107 (cirurgia já tem hub_appointment_id).

ALTER TABLE public.hub_hospitalizations
  ADD COLUMN IF NOT EXISTS hub_appointment_id uuid
    REFERENCES public.hub_appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_hospitalizations_appointment
  ON public.hub_hospitalizations (hub_appointment_id)
  WHERE deleted_at IS NULL AND hub_appointment_id IS NOT NULL;

COMMENT ON COLUMN public.hub_hospitalizations.hub_appointment_id IS
  'Slot de agenda espelhado na admissão pelo Consultório (marco do dia; não modela estadia multi-dia).';

-- Cirurgia: o vínculo também pode nascer do Consultório (não só da recepção).
COMMENT ON COLUMN public.hub_surgeries.hub_appointment_id IS
  'Slot de agenda vinculado à cirurgia (origem Agenda ou espelho do Consultório). Usado para dedupe de cobrança e ciclo de vida do horário.';
