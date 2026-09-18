-- PetMi Hub — vínculo do profissional com a clínica (equipe fixa vs convidado).
-- Pré-requisitos: `009_create_hub_staff.sql`.
-- Independente de `has_hub_access`: convidado pode ganhar login depois sem mudar o vínculo.

ALTER TABLE public.hub_staff_members
  ADD COLUMN IF NOT EXISTS affiliation text NOT NULL DEFAULT 'internal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hub_staff_members_affiliation_chk'
  ) THEN
    ALTER TABLE public.hub_staff_members
      ADD CONSTRAINT hub_staff_members_affiliation_chk
      CHECK (affiliation IN ('internal', 'guest'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hub_staff_members_clinic_affiliation
  ON public.hub_staff_members (clinic_id, affiliation)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.hub_staff_members.affiliation IS
  'internal = equipe da clínica; guest = convidado/pontual (ex.: anestesista). Independente de has_hub_access.';

NOTIFY pgrst, 'reload schema';
