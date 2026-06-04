-- PetMi Hub — data de nascimento opcional em `hub_staff_members`.
-- Seguro em bases que já aplicaram `create_hub_staff.sql` sem esta coluna.

ALTER TABLE public.hub_staff_members
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN public.hub_staff_members.birth_date IS 'Data de nascimento do profissional (opcional).';
