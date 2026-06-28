-- PetMi Hub — token público para visualização read-only da comanda (paridade com orçamento).
-- Idempotente. Executar depois de create_hub_comandas.sql.

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hub_comandas_public_token
  ON public.hub_comandas (public_token)
  WHERE public_token IS NOT NULL;

COMMENT ON COLUMN public.hub_comandas.public_token IS 'Token único para acesso público read-only via /api/public/comandas/:token.';

NOTIFY pgrst, 'reload schema';
