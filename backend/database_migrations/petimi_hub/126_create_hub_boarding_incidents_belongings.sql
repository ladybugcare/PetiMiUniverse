-- PetMi Hub — Hotel & Creche: intercorrências (Fase 5) e pertences (Fase 6).
-- Pré-requisitos: 051_create_hub_boarding_reservations.sql, moddatetime.

-- ─── hub_boarding_incidents ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_boarding_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'health', 'injury', 'behavior', 'feeding', 'elimination', 'escape', 'property', 'other'
  )),
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  action_taken text,
  tutor_notified_at timestamptz,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_incidents_reservation
  ON public.hub_boarding_incidents (hub_boarding_reservation_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_boarding_incidents_clinic_open
  ON public.hub_boarding_incidents (clinic_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_boarding_incidents_updated_at ON public.hub_boarding_incidents;
CREATE TRIGGER update_hub_boarding_incidents_updated_at
  BEFORE UPDATE ON public.hub_boarding_incidents
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_boarding_incidents IS
  'Intercorrências da estadia (saúde, comportamento, lesão...). Abertas colocam o pet em atenção no painel.';

-- ─── hub_boarding_belongings ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_boarding_belongings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'food', 'medication', 'bed', 'toy', 'leash_collar', 'clothing', 'bowl', 'other'
  )),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes text,
  checkout_status text NOT NULL DEFAULT 'pending' CHECK (checkout_status IN (
    'pending', 'returned', 'missing', 'consumed'
  )),
  checkout_checked_at timestamptz,
  checkout_checked_by_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_hub_boarding_belongings_reservation
  ON public.hub_boarding_belongings (hub_boarding_reservation_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_hub_boarding_belongings_updated_at ON public.hub_boarding_belongings;
CREATE TRIGGER update_hub_boarding_belongings_updated_at
  BEFORE UPDATE ON public.hub_boarding_belongings
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_boarding_belongings IS
  'Pertences deixados pelo tutor: conferência na entrada (cadastro) e na saída (devolvido, faltando, consumido).';

NOTIFY pgrst, 'reload schema';
