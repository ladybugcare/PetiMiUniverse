-- Empresa/pessoa do fornecedor e ficha completa do fabricante (mesmo conjunto de campos).
-- Pré-requisito: `008_create_hub_inventory.sql`.

ALTER TABLE public.hub_suppliers
  ADD COLUMN IF NOT EXISTS party_name text;

COMMENT ON COLUMN public.hub_suppliers.party_name IS
  'Empresa ou pessoa que de fato fornece; um cadastro pode atender vários produtos.';

ALTER TABLE public.hub_manufacturers
  ADD COLUMN IF NOT EXISTS party_name text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.hub_manufacturers.party_name IS
  'Empresa ou pessoa por trás da marca / fabricante.';
