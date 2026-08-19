-- PetMi Hub — perfil base "Funcionário" (CSTAFF).
-- Papel mínimo de governança; módulos vêm das áreas operacionais (ex.: leva_traz).

ALTER TABLE public.clinic_users
  DROP CONSTRAINT IF EXISTS clinic_users_role_check;

ALTER TABLE public.clinic_users
  ADD CONSTRAINT clinic_users_role_check CHECK (role IN (
    'CADMIN',
    'CMANAGER',
    'CASSISTANT',
    'CVET_INTERNAL',
    'CGROOMER',
    'CFINANCE',
    'CSTAFF'
  ));

ALTER TABLE public.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_role_check;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_role_check CHECK (role IN (
    'CADMIN',
    'CMANAGER',
    'CASSISTANT',
    'CVET_INTERNAL',
    'CGROOMER',
    'CFINANCE',
    'CSTAFF'
  ));

ALTER TABLE public.hub_staff_members
  DROP CONSTRAINT IF EXISTS hub_staff_members_hub_access_role_chk;

ALTER TABLE public.hub_staff_members
  ADD CONSTRAINT hub_staff_members_hub_access_role_chk CHECK (
    hub_access_role IS NULL OR hub_access_role IN (
      'CADMIN',
      'CMANAGER',
      'CASSISTANT',
      'CVET_INTERNAL',
      'CGROOMER',
      'CFINANCE',
      'CSTAFF'
    )
  );

COMMENT ON COLUMN public.clinic_users.role IS
  'Role interna do usuário na clínica (CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL, CGROOMER, CFINANCE, CSTAFF).';

NOTIFY pgrst, 'reload schema';
