-- PetMi Hub — vincula convites de equipe ao registro hub_staff_members.
-- Pré-requisitos: user_invitations (petimi_vet), hub_staff_members.

ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS staff_member_id uuid REFERENCES public.hub_staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_invitations_staff_member
  ON public.user_invitations (staff_member_id)
  WHERE staff_member_id IS NOT NULL;

COMMENT ON COLUMN public.user_invitations.staff_member_id IS
  'Profissional da equipe (hub_staff_members) associado ao convite Hub; preenchido ao convidar pela página Equipe.';
