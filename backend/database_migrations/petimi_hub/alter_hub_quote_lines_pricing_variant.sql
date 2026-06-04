-- PetMi Hub — opção de preço explícita em linhas de orçamento (creche, clínica, leva e traz).
-- Pré-requisito: `create_hub_prospects_and_quotes.sql` (e opcionalmente `alter_hub_quotes_v2.sql`).

ALTER TABLE public.hub_quote_lines
  ADD COLUMN IF NOT EXISTS pricing_variant jsonb;

COMMENT ON COLUMN public.hub_quote_lines.pricing_variant IS
  'Escolha de faixa quando a matriz não é só porte/pelagem: {period}, {consult_type} ou {km_tier_index}.';
