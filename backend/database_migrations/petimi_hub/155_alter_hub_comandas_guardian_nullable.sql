-- PetMi Hub — comanda de balcão pode ser avulsa (sem tutor).
-- Pré-requisitos: 039_create_hub_comandas.sql
-- Uso: venda rápida no Caixa sem cadastro de cliente; crédito do tutor continua exigindo guardian.

ALTER TABLE public.hub_comandas
  ALTER COLUMN guardian_id DROP NOT NULL;

COMMENT ON TABLE public.hub_comandas IS
  'Comanda por tutor (opcional em venda avulsa de balcão); itens em hub_comanda_items; liquidação em hub_receivables (1:N).';

COMMENT ON COLUMN public.hub_comandas.guardian_id IS
  'Tutor responsável. Null = venda avulsa no balcão (sem cliente). Pagamento com crédito do cliente exige tutor.';
