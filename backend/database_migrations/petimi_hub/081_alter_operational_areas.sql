-- PetMi Hub — áreas operacionais por funcionário (complementam o papel de governança).
-- Pré-requisitos: hub_staff_members, clinic_users.

ALTER TABLE public.hub_staff_members
  ADD COLUMN IF NOT EXISTS operational_areas text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.clinic_users
  ADD COLUMN IF NOT EXISTS operational_areas text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.hub_staff_members.operational_areas IS
  'Áreas do Hub que o profissional pode acessar (recepcao, caixa, clinica, banho_tosa, …). Unidas ao hub_access_role no RBAC.';

COMMENT ON COLUMN public.clinic_users.operational_areas IS
  'Cópia das áreas operacionais do hub_staff_members vinculado; usada na autorização da sessão.';

NOTIFY pgrst, 'reload schema';
