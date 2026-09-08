-- Preço variável no cadastro do serviço (permite alterar valor na hora de cobrar).
-- Pré-requisitos: 003 / 005 (hub_service_types + pricing).

ALTER TABLE public.hub_service_types
  ADD COLUMN IF NOT EXISTS price_mode text NOT NULL DEFAULT 'fixed'
    CHECK (price_mode IN ('fixed', 'variable')),
  ADD COLUMN IF NOT EXISTS price_min numeric(12, 2)
    CHECK (price_min IS NULL OR price_min >= 0),
  ADD COLUMN IF NOT EXISTS price_max numeric(12, 2)
    CHECK (price_max IS NULL OR price_max >= 0);

-- Faixa coerente quando ambos existem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hub_service_types_price_range_chk'
  ) THEN
    ALTER TABLE public.hub_service_types
      ADD CONSTRAINT hub_service_types_price_range_chk
      CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min);
  END IF;
END $$;

COMMENT ON COLUMN public.hub_service_types.price_mode IS
  'fixed = valor de catálogo travado na operação; variable = permite informar valor na hora (com faixa opcional).';
COMMENT ON COLUMN public.hub_service_types.price_min IS
  'Limite inferior sugerido quando price_mode = variable (valor fora da faixa exige aprovação financeira).';
COMMENT ON COLUMN public.hub_service_types.price_max IS
  'Limite superior sugerido quando price_mode = variable (valor fora da faixa exige aprovação financeira).';

NOTIFY pgrst, 'reload schema';
