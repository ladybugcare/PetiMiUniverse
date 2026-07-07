-- PetMi Hub — observação interna do financeiro (separada da do caixa).
-- Pré-requisito: 039_create_hub_comandas.sql

ALTER TABLE public.hub_comandas
  ADD COLUMN IF NOT EXISTS finance_notes text;

COMMENT ON COLUMN public.hub_comandas.notes IS
  'Observação interna do caixa. Após finance_handoff_at, não deve ser alterada pelo financeiro.';

COMMENT ON COLUMN public.hub_comandas.finance_notes IS
  'Observação interna do financeiro (após envio da comanda ao módulo Financeiro).';

NOTIFY pgrst, 'reload schema';
