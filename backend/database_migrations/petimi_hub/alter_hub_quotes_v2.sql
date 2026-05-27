-- PetMi Hub — evolução de orçamentos (v2).
-- Pré-requisitos: `create_hub_prospects_and_quotes.sql` já aplicado.
-- Novidades:
--   * Desconto geral (kind + value) + subtotal/total em colunas separadas.
--   * `client_notes` (observação visível ao cliente, ≠ `notes` interno).
--   * `valid_days` configurável por orçamento (default 7).
--   * `public_token` para link público read-only.
--   * Novo status `awaiting_return` (sent → awaiting_return → accepted/cancelled/expired).
--   * Pets ganham `coat_type`, `age_months`, `sex` para precificação por pelagem.
--   * Tabela nova `hub_quote_line_pets`: 1 linha por (line × pet) com `unit_price` snapshot.
--   * `hub_prospects.tax_id` passa a opcional (CPF agora é opcional na UI).

ALTER TABLE public.hub_quotes
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_kind text CHECK (discount_kind IS NULL OR discount_kind IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS client_notes text,
  ADD COLUMN IF NOT EXISTS valid_days integer NOT NULL DEFAULT 7 CHECK (valid_days BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS hub_quotes_public_token_unique
  ON public.hub_quotes (public_token)
  WHERE public_token IS NOT NULL;

ALTER TABLE public.hub_quotes
  DROP CONSTRAINT IF EXISTS hub_quotes_status_check;
ALTER TABLE public.hub_quotes
  ADD CONSTRAINT hub_quotes_status_check
  CHECK (status IN ('draft', 'sent', 'awaiting_return', 'accepted', 'expired', 'cancelled'));

COMMENT ON COLUMN public.hub_quotes.subtotal_amount IS 'Soma das line_total antes do desconto geral.';
COMMENT ON COLUMN public.hub_quotes.discount_kind IS 'percent (0..100) ou fixed (R$).';
COMMENT ON COLUMN public.hub_quotes.discount_value IS 'Valor do desconto conforme discount_kind.';
COMMENT ON COLUMN public.hub_quotes.client_notes IS 'Observação visível ao cliente (≠ notes interno).';
COMMENT ON COLUMN public.hub_quotes.valid_days IS 'Quantidade de dias de validade após envio (default 7).';
COMMENT ON COLUMN public.hub_quotes.public_token IS 'Token único para acesso público read-only via /api/public/quotes/:token.';

ALTER TABLE public.hub_quote_pets
  ADD COLUMN IF NOT EXISTS coat_type text,
  ADD COLUMN IF NOT EXISTS age_months integer CHECK (age_months IS NULL OR age_months >= 0),
  ADD COLUMN IF NOT EXISTS sex text CHECK (sex IS NULL OR sex IN ('M', 'F', 'U'));

COMMENT ON COLUMN public.hub_quote_pets.coat_type IS 'Pelagem (usado por precificação Banho & Tosa por pelagem).';
COMMENT ON COLUMN public.hub_quote_pets.age_months IS 'Idade aproximada em meses (opcional, exibição).';

CREATE TABLE IF NOT EXISTS public.hub_quote_line_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.hub_quote_lines(id) ON DELETE CASCADE,
  quote_pet_id uuid NOT NULL REFERENCES public.hub_quote_pets(id) ON DELETE CASCADE,
  unit_price numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  applied_porte text,
  applied_coat_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (line_id, quote_pet_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_quote_line_pets_line
  ON public.hub_quote_line_pets (line_id);

CREATE INDEX IF NOT EXISTS idx_hub_quote_line_pets_pet
  ON public.hub_quote_line_pets (quote_pet_id);

COMMENT ON TABLE public.hub_quote_line_pets IS 'Preço por (linha de serviço × pet) num orçamento; line_total = SUM(unit_price).';

ALTER TABLE public.hub_prospects
  ALTER COLUMN tax_id DROP NOT NULL;

COMMENT ON COLUMN public.hub_prospects.tax_id IS 'CPF opcional (digits only). Pode ser NULL nos orçamentos rápidos.';
