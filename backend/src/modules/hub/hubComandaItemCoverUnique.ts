/** Unique parcial P2-05 (migration 182): um item de comanda com cobertura ativa. */
const COMANDA_ITEM_COVER_UNIQUE_INDEX = 'uniq_hub_receivable_lines_comanda_item_cover';

export const COMANDA_ITEM_ALREADY_BILLED_MESSAGE =
  'Esta comanda já foi faturada (outro checkout em andamento ou concluído). Atualize a tela.';

export function isComandaItemCoverUniqueViolation(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const msg = String(error.message || '');
  if (error.code === '23505') {
    if (!msg) return true;
    return msg.includes(COMANDA_ITEM_COVER_UNIQUE_INDEX) || msg.includes('comanda_item');
  }
  return msg.includes(COMANDA_ITEM_COVER_UNIQUE_INDEX);
}
