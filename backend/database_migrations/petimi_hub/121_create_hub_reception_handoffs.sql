-- PetMi Hub — fila de custódia da Operação da Recepção.
-- Não guarda status de banho, clínica, hotel ou transporte: só a transferência
-- pendente (chegada, extra, encaminhamento, retirada, embarque).
-- Pré-requisitos: clinics, units, hub_pets, hub_guardians, hub_staff_members.

CREATE TABLE IF NOT EXISTS public.hub_reception_handoffs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id               uuid REFERENCES public.units(id) ON DELETE SET NULL,
  pet_id                uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  guardian_id           uuid REFERENCES public.hub_guardians(id) ON DELETE SET NULL,
  kind                  text NOT NULL CHECK (kind IN (
                          'chegada',
                          'autorizar_extra',
                          'encaminhar',
                          'retirada_balcao',
                          'embarque'
                        )),
  source_type           text NOT NULL,
  source_id             uuid NOT NULL,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  context               jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at             timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by_staff_id  uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  resolution            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hub_reception_handoffs IS
  'Tarefa da recepção derivada do estado dos outros módulos. A fonte de verdade continua no domínio (agenda, sessão, encounter, reserva, parada).';

COMMENT ON COLUMN public.hub_reception_handoffs.context IS
  'Rótulo operacional para o card (serviço, horário, ids). Sem valores financeiros.';

CREATE UNIQUE INDEX IF NOT EXISTS hub_reception_handoffs_one_open
  ON public.hub_reception_handoffs (source_type, source_id, kind)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS hub_reception_handoffs_unit_status
  ON public.hub_reception_handoffs (clinic_id, unit_id, status, opened_at);

NOTIFY pgrst, 'reload schema';
