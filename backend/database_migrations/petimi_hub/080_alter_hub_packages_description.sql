-- PetMi Hub — descrição pública do pacote (venda / tutor).
-- Pré-requisitos: 045_create_hub_packages_and_subscriptions.sql.

ALTER TABLE public.hub_packages
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.hub_packages.description IS
  'Descrição exibida na venda; pode ser montada a partir dos serviços do catálogo e editada pela clínica.';

NOTIFY pgrst, 'reload schema';
