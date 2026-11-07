-- PetMi Hub — Hotel & Creche: ficha de cuidados do pet + plano de cuidados da estadia (Fase 2).
-- Ficha = informação permanente (reaproveitada entre estadias).
-- Plano = cópia confirmável por reserva; cada bloco tem estado herdado/confirmado/alterado/pendente.
-- Pré-requisitos: 002 (hub_pets), 051 (hub_boarding_reservations), moddatetime.

-- ─── hub_pet_care_profiles ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_pet_care_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  -- { food_source: own|house, food_name, meals: [{ time: 'HH:MM', amount, notes }], restrictions }
  feeding jsonb,
  -- [{ name, dose, times: ['HH:MM'], instructions }] — [] = sem medicação; null = não informado
  medications jsonb,
  -- { times: ['HH:MM'], notes }
  walks jsonb,
  -- { sociability: sociable|selective|isolated, group_play_allowed, contact_restrictions, special_care }
  handling jsonb,
  notes text,
  updated_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_pet_care_profiles_pet
  ON public.hub_pet_care_profiles (pet_id);

CREATE INDEX IF NOT EXISTS idx_hub_pet_care_profiles_clinic
  ON public.hub_pet_care_profiles (clinic_id);

DROP TRIGGER IF EXISTS update_hub_pet_care_profiles_updated_at ON public.hub_pet_care_profiles;
CREATE TRIGGER update_hub_pet_care_profiles_updated_at
  BEFORE UPDATE ON public.hub_pet_care_profiles
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_pet_care_profiles IS
  'Ficha de cuidados do pet para Hotel & Creche (alimentação, medicação, passeios, manejo). Alertas clínicos ficam em hub_pet_clinical_flags.';

-- ─── hub_boarding_care_plans ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hub_boarding_care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  hub_boarding_reservation_id uuid NOT NULL REFERENCES public.hub_boarding_reservations(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.hub_pets(id) ON DELETE CASCADE,
  feeding jsonb,
  medications jsonb,
  walks jsonb,
  handling jsonb,
  -- { allowed: boolean, times: ['HH:MM'] }
  recreation jsonb,
  instructions text,
  -- { feeding|medications|walks|handling|recreation: inherited|confirmed|overridden|pending }
  block_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid,
  tasks_generated_at timestamptz,
  tutor_token text,
  tutor_token_expires_at timestamptz,
  tutor_submission jsonb,
  tutor_submitted_at timestamptz,
  tutor_submission_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_boarding_care_plans_reservation
  ON public.hub_boarding_care_plans (hub_boarding_reservation_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_boarding_care_plans_tutor_token
  ON public.hub_boarding_care_plans (tutor_token)
  WHERE tutor_token IS NOT NULL;

DROP TRIGGER IF EXISTS update_hub_boarding_care_plans_updated_at ON public.hub_boarding_care_plans;
CREATE TRIGGER update_hub_boarding_care_plans_updated_at
  BEFORE UPDATE ON public.hub_boarding_care_plans
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE public.hub_boarding_care_plans IS
  'Plano de cuidados da estadia (herdado da ficha do pet, confirmado pela recepção). Gera hub_boarding_tasks. tutor_* = link para o tutor pré-confirmar cuidados.';

NOTIFY pgrst, 'reload schema';
