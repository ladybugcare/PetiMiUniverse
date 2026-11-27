/** Data local YYYY-MM-DD. */
export function inventoryTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Lote vencido quando tem validade e ela é estritamente anterior a hoje. */
export function isLotExpired(
  expiryDate: string | null | undefined,
  todayYmd: string = inventoryTodayYmd(),
): boolean {
  if (expiryDate == null || expiryDate === '') return false;
  return expiryDate.slice(0, 10) < todayYmd;
}

export const LOT_EXPIRED_CREATE_MSG = 'Não é permitido cadastrar lote com validade vencida.';
/** Bloqueio compartilhado: venda, comanda e consumo clínico. */
export const LOT_EXPIRED_SALE_MSG = 'Não é permitido usar lote vencido.';
