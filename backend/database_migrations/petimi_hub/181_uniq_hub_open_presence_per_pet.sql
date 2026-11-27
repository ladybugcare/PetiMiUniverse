-- PetMi Hub — P1-05: no máximo uma presença aberta por pet (clínico / B&T).
-- Pré-requisitos: hub_appointments, hub_encounters, hub_grooming_sessions.
-- Soft-delete de duplicatas mais antigas antes dos unique parciais (dois cliques / retries).

-- Sessões B&T abertas duplicadas: mantém a mais recente.
WITH ranked_groom AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, pet_id
      ORDER BY COALESCE(checked_in_at, created_at) DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.hub_grooming_sessions
  WHERE deleted_at IS NULL
    AND grooming_stage IN ('checked_in', 'queued', 'in_service', 'finishing')
)
UPDATE public.hub_grooming_sessions s
SET deleted_at = now()
FROM ranked_groom r
WHERE s.id = r.id
  AND r.rn > 1
  AND s.deleted_at IS NULL;

-- Encaixes B&T (walk_in) abertos duplicados.
WITH ranked_groom_appt AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, pet_id
      ORDER BY COALESCE(starts_at, created_at) DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.hub_appointments
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND appointment_kind = 'walk_in'
    AND status IN ('checked_in', 'in_progress')
)
UPDATE public.hub_appointments a
SET deleted_at = now()
FROM ranked_groom_appt r
WHERE a.id = r.id
  AND r.rn > 1
  AND a.deleted_at IS NULL;

-- Encaixes clínicos (walk-in / emergência) abertos duplicados.
WITH ranked_clin_appt AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, pet_id
      ORDER BY COALESCE(starts_at, created_at) DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.hub_appointments
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND appointment_kind IN ('clinical_walk_in', 'clinical_emergency')
    AND status IN ('checked_in', 'in_progress')
)
UPDATE public.hub_appointments a
SET deleted_at = now()
FROM ranked_clin_appt r
WHERE a.id = r.id
  AND r.rn > 1
  AND a.deleted_at IS NULL;

-- Encounters abertos duplicados (pet identificado).
WITH ranked_enc AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, pet_id
      ORDER BY COALESCE(started_at, created_at) DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.hub_encounters
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND status IN ('waiting', 'in_progress')
)
UPDATE public.hub_encounters e
SET deleted_at = now()
FROM ranked_enc r
WHERE e.id = r.id
  AND r.rn > 1
  AND e.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_grooming_sessions_pet_open
  ON public.hub_grooming_sessions (clinic_id, pet_id)
  WHERE deleted_at IS NULL
    AND grooming_stage IN ('checked_in', 'queued', 'in_service', 'finishing');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_appointments_pet_grooming_walk_in_open
  ON public.hub_appointments (clinic_id, pet_id)
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND appointment_kind = 'walk_in'
    AND status IN ('checked_in', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_appointments_pet_clinical_walk_in_open
  ON public.hub_appointments (clinic_id, pet_id)
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND appointment_kind IN ('clinical_walk_in', 'clinical_emergency')
    AND status IN ('checked_in', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_encounters_pet_open
  ON public.hub_encounters (clinic_id, pet_id)
  WHERE deleted_at IS NULL
    AND pet_id IS NOT NULL
    AND status IN ('waiting', 'in_progress');

COMMENT ON INDEX public.uniq_hub_grooming_sessions_pet_open IS
  'P1-05: no máximo uma sessão B&T aberta por pet/clínica (corrida de cliques).';
COMMENT ON INDEX public.uniq_hub_appointments_pet_grooming_walk_in_open IS
  'P1-05: no máximo um encaixe walk_in B&T aberto por pet/clínica.';
COMMENT ON INDEX public.uniq_hub_appointments_pet_clinical_walk_in_open IS
  'P1-05: no máximo um encaixe clínico/emergência aberto por pet/clínica.';
COMMENT ON INDEX public.uniq_hub_encounters_pet_open IS
  'P1-05: no máximo um encounter aberto por pet identificado/clínica.';
