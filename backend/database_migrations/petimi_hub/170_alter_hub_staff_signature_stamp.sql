-- Assinatura e carimbo digitais do profissional (imagem para PDFs clínicos).
-- Não é assinatura ICP-Brasil; uso visual em receitas, exames e encaminhamentos.

ALTER TABLE public.hub_staff_members
  ADD COLUMN IF NOT EXISTS signature_image_url text,
  ADD COLUMN IF NOT EXISTS stamp_image_url text;

COMMENT ON COLUMN public.hub_staff_members.signature_image_url IS
  'URL pública da foto/imagem da assinatura manuscrita do profissional (Storage hub-staff-photos).';
COMMENT ON COLUMN public.hub_staff_members.stamp_image_url IS
  'URL pública da foto/imagem do carimbo profissional (Storage hub-staff-photos).';
