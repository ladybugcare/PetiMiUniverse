-- PetMi Hub — falha no Leva e Traz com pet a bordo.
-- A parada falha guarda o desfecho (pet volta à clínica ou não) e a decisão da recepção.
-- A recepção ganha a tarefa `lt_falha`, aberta quando o retorno à clínica é concluído.
-- Pré-requisitos: itens 12c, 91 e 121.

ALTER TABLE public.hub_pickup_stops
  ADD COLUMN IF NOT EXISTS failure_outcome text
    CHECK (failure_outcome IS NULL OR failure_outcome IN ('no_pet', 'return_to_clinic')),
  ADD COLUMN IF NOT EXISTS failure_resolution text
    CHECK (failure_resolution IS NULL OR failure_resolution IN ('pending', 'tutor_pickup', 'new_leg', 'none')),
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_stop_id uuid REFERENCES public.hub_pickup_stops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retry_appointment_id uuid REFERENCES public.hub_appointments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_pickup_stops.failure_outcome IS
  'Só em status failed: return_to_clinic quando o pet estava com o motorista (entrega ou coleta já embarcada).';
COMMENT ON COLUMN public.hub_pickup_stops.failure_resolution IS
  'Decisão da recepção sobre a falha: pending (aguarda), tutor_pickup, new_leg ou none (sem pet a bordo).';
COMMENT ON COLUMN public.hub_pickup_stops.return_stop_id IS
  'Parada clinic_return que traz o pet de volta depois da falha.';
COMMENT ON COLUMN public.hub_pickup_stops.retry_appointment_id IS
  'Nova perna de Leva e Traz criada pela recepção para refazer a entrega.';

CREATE INDEX IF NOT EXISTS hub_pickup_stops_failure_pending
  ON public.hub_pickup_stops (clinic_id, return_stop_id)
  WHERE status = 'failed' AND failure_resolution = 'pending';

ALTER TABLE public.hub_reception_handoffs
  DROP CONSTRAINT IF EXISTS hub_reception_handoffs_kind_check;

ALTER TABLE public.hub_reception_handoffs
  ADD CONSTRAINT hub_reception_handoffs_kind_check CHECK (kind IN (
    'chegada',
    'autorizar_extra',
    'encaminhar',
    'retirada_balcao',
    'embarque',
    'lt_falha'
  ));

NOTIFY pgrst, 'reload schema';
