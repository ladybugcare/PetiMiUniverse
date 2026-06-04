-- PetMi Hub — Eventos de internação por horário (Fase 7 Clínica).
-- Evolução contínua durante a internação: sinais vitais, medicação, alimentação,
-- fluidoterapia e anotações de enfermagem.
-- Pré-requisito: create_hub_hospitalizations.sql já aplicado.

CREATE TABLE IF NOT EXISTS public.hub_hospitalization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES public.hub_hospitalizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('vital', 'medication', 'feeding', 'fluid', 'nursing', 'note')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- Payload flexível por tipo de evento:
  -- vital:      { weight_kg, temperature_c, heart_rate, respiratory_rate, spo2, blood_pressure, notes }
  -- medication: { medication_name, dosage, route, notes }
  -- feeding:    { food_type, amount_g, accepted, notes }
  -- fluid:      { fluid_type, rate_ml_h, volume_ml, notes }
  -- nursing:    { procedure, notes }
  -- note:       { text }
  payload jsonb NOT NULL DEFAULT '{}',
  hub_staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_hosp_events_hospitalization
  ON public.hub_hospitalization_events (hospitalization_id, recorded_at DESC);

COMMENT ON TABLE public.hub_hospitalization_events IS 'Eventos de evolução durante internação (vitais, medicação, alimentação, fluido, enfermagem, notas).';
COMMENT ON COLUMN public.hub_hospitalization_events.kind IS 'vital|medication|feeding|fluid|nursing|note';
COMMENT ON COLUMN public.hub_hospitalization_events.payload IS 'JSONB com campos específicos por tipo. Ver documentação inline.';

NOTIFY pgrst, 'reload schema';
