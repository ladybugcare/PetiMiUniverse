-- PetMi Hub — embarque físico na devolução L&T (metadado ortogonal ao status da parada).
-- Pré-requisitos: 012c_create_hub_pickup_routes, 083, 092, 121.
-- boarded_* registra quem confirmou a transferência pet → motorista (recepção ou motorista).

ALTER TABLE public.hub_pickup_stops
  ADD COLUMN IF NOT EXISTS boarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS boarded_by_staff_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS boarded_source text,
  ADD COLUMN IF NOT EXISTS boarded_late boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hub_pickup_stops_boarded_source_check'
  ) THEN
    ALTER TABLE public.hub_pickup_stops
      ADD CONSTRAINT hub_pickup_stops_boarded_source_check
      CHECK (boarded_source IS NULL OR boarded_source IN ('reception', 'driver'));
  END IF;
END $$;

COMMENT ON COLUMN public.hub_pickup_stops.boarded_at IS
  'Horário em que o embarque na devolução foi registrado (não o status de deslocamento).';
COMMENT ON COLUMN public.hub_pickup_stops.boarded_by_staff_id IS
  'Staff que confirmou o embarque; autoria imutável após o primeiro registro.';
COMMENT ON COLUMN public.hub_pickup_stops.boarded_source IS
  'Origem da confirmação: reception | driver.';
COMMENT ON COLUMN public.hub_pickup_stops.boarded_late IS
  'True quando a confirmação ocorreu com a parada já em deslocamento/chegada/conclusão (registro posterior).';

-- Ocorrências de divergência (pet saiu fisicamente com bloqueio clínico/hotel ativo).
-- Não equivale a liberação autorizada nem preenche boarded_*.
CREATE TABLE IF NOT EXISTS public.hub_custody_divergence_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_pickup_stop_id     uuid REFERENCES public.hub_pickup_stops(id) ON DELETE SET NULL,
  pet_id                 uuid REFERENCES public.hub_pets(id) ON DELETE SET NULL,
  reported_by_staff_id   uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  block_kind             text NOT NULL CHECK (block_kind IN ('clinical', 'boarding', 'linked_service', 'other')),
  detail                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_custody_divergence_events_clinic_time
  ON public.hub_custody_divergence_events (clinic_id, created_at DESC);

COMMENT ON TABLE public.hub_custody_divergence_events IS
  'Registro auditável de divergência operacional (ex.: motorista informa pet a bordo com bloqueio ativo). Não autoriza embarque.';

NOTIFY pgrst, 'reload schema';
