-- Preço snapshot da vacina aplicada (para comanda / cobrança).
-- Pré-requisito: 025i_create_hub_prescriptions_vaccinations.sql

ALTER TABLE public.hub_vaccination_records
  ADD COLUMN IF NOT EXISTS price numeric(12,2) CHECK (price IS NULL OR price >= 0);

COMMENT ON COLUMN public.hub_vaccination_records.price IS
  'Preço de venda no momento da aplicação (snapshot do item de estoque ou valor informado).';

NOTIFY pgrst, 'reload schema';
