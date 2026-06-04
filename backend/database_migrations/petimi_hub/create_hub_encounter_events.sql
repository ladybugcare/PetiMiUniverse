-- Timeline de evolução clínica (Fase 2).

CREATE TABLE IF NOT EXISTS public.hub_encounter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  hub_encounter_id uuid REFERENCES public.hub_encounters(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'note' CHECK (event_type IN (
    'consultation',
    'return_visit',
    'hospitalization',
    'surgery',
    'vaccination',
    'exam',
    'note'
  )),
  title text NOT NULL,
  body text,
  event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_encounter_events_pet_at
  ON public.hub_encounter_events (pet_id, event_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_encounter_events_updated_at ON public.hub_encounter_events;
CREATE TRIGGER update_hub_encounter_events_updated_at
  BEFORE UPDATE ON public.hub_encounter_events
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);
