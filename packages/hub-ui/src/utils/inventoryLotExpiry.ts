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
  return expiryDate < todayYmd;
}

export const LOT_EXPIRED_CREATE_MSG = 'Não é permitido cadastrar lote com validade vencida.';
export const LOT_EXPIRED_SALE_MSG = 'Não é permitido vender produto com lote vencido.';
