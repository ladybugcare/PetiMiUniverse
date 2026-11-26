-- Intent no cancelamento do recebível:
--   cancel_rebill = true  → corrigir cobrança (reabre itens da comanda)
--   cancel_rebill = false → anular venda (itens permanecem cobertos; comanda pode ir a cancelada)
--   NULL → legado / ainda não cancelado neste regime
ALTER TABLE public.hub_receivables
  ADD COLUMN IF NOT EXISTS cancel_rebill boolean;

COMMENT ON COLUMN public.hub_receivables.cancel_rebill IS
  'No cancelamento: true = reissue (reabre itens); false = void_sale (não reabre). NULL = legado/não cancelado.';
