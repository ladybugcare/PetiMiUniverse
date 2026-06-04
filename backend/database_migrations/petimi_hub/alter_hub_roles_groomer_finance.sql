-- PetMi Hub — novos papéis operacionais do MVP.
-- Separa Banho e Tosa e Financeiro de CASSISTANT, reduzindo acesso indevido.

ALTER TABLE public.clinic_users
  DROP CONSTRAINT IF EXISTS clinic_users_role_check;

ALTER TABLE public.clinic_users
  ADD CONSTRAINT clinic_users_role_check CHECK (role IN (
    'CADMIN',
    'CMANAGER',
    'CASSISTANT',
    'CVET_INTERNAL',
    'CGROOMER',
    'CFINANCE'
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
    'CFINANCE'
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
      'CFINANCE'
    )
  );

COMMENT ON COLUMN public.clinic_users.role IS 'Role interna do usuário na clínica (CADMIN, CMANAGER, CASSISTANT, CVET_INTERNAL, CGROOMER, CFINANCE).';

NOTIFY pgrst, 'reload schema';
