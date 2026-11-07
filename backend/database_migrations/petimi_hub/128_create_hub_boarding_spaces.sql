-- PetMi Hub — Hotel & Creche: acomodações com capacidade (Fase 8).
-- Separado de hub_resources (agenda, capacidade exclusiva por horário): aqui a ocupação é por estadia.
-- Pré-requisitos: 051_create_hub_boarding_reservations.sql, moddatetime.

CREATE TABLE IF NOT EXISTS public.hub_boarding_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'kennel' CHECK (kind IN ('kennel', 'suite', 'room', 'yard', 'other')),
  mode text NOT NULL DEFAULT 'hotel' CHECK (mode IN ('hotel', 'daycare', 'shared')),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_spaces_clinic_unit
  ON public.hub_boarding_spaces (clinic_id, unit_id, sort_order)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_boarding_spaces_updated_at ON public.hub_boarding_spaces;
CREATE TRIGGER update_hub_boarding_spaces_updated_at
  BEFORE UPDATE ON public.hub_boarding_spaces
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_boarding_spaces IS
  'Acomodações de Hotel & Creche (baias, suítes, salas, áreas) com capacidade de pets simultâneos.';

ALTER TABLE public.hub_boarding_reservations
  ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES public.hub_boarding_spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hub_boarding_reservations_space
  ON public.hub_boarding_reservations (space_id)
  WHERE space_id IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
