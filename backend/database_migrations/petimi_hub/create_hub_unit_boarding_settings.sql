-- PetMi Hub — Configurações de capacidade de Hotel & Creche por unidade.
-- Pré-requisitos: units, clinics, moddatetime.
-- Executar no Supabase SQL Editor depois de create_hub_boarding_reservations.sql (item 51).

CREATE TABLE IF NOT EXISTS public.hub_unit_boarding_settings (
  unit_id uuid PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- NULL = sem limite configurado (sem alerta de overbooking)
  hotel_slots smallint CHECK (hotel_slots IS NULL OR hotel_slots > 0),
  daycare_slots_per_shift smallint CHECK (daycare_slots_per_shift IS NULL OR daycare_slots_per_shift > 0),
  -- Opcional: horário-limite de check-out para não cobrar diária extra (ex. '12:00:00')
  checkout_cutoff_time time,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_unit_boarding_settings_clinic
  ON public.hub_unit_boarding_settings (clinic_id);

COMMENT ON TABLE public.hub_unit_boarding_settings IS
  'Limites de vagas de Hotel e Creche por unidade. NULL = sem limite configurado.';

DROP TRIGGER IF EXISTS update_hub_unit_boarding_settings_updated_at ON public.hub_unit_boarding_settings;
CREATE TRIGGER update_hub_unit_boarding_settings_updated_at
  BEFORE UPDATE ON public.hub_unit_boarding_settings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

NOTIFY pgrst, 'reload schema';
