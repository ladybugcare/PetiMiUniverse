/** Data local YYYY-MM-DD (mesmo critério operacional do estoque). */
export function inventoryTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Soma dias a um YYYY-MM-DD local (meio-dia local evita derrubar o dia no fuso). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  return inventoryTodayYmd(dt);
}

/** Dias até a validade (negativo = já vencido). */
export function daysUntilYmd(
  expiryYmd: string,
  todayYmd: string = inventoryTodayYmd(),
): number {
  const t0 = Date.parse(`${todayYmd.slice(0, 10)}T12:00:00`);
  const t1 = Date.parse(`${expiryYmd.slice(0, 10)}T12:00:00`);
  return Math.round((t1 - t0) / 86400000);
}

/** Lote vencido quando tem validade e ela é estritamente anterior a hoje. */
export function isLotExpired(
  expiryDate: string | null | undefined,
  todayYmd: string = inventoryTodayYmd(),
): boolean {
  if (expiryDate == null || expiryDate === '') return false;
  return expiryDate.slice(0, 10) < todayYmd;
}

/**
 * Filtro de alertas de validade.
 * Lote já vencido com saldo sempre entra; na política, só se estiver na janela d30/d60/d90.
 */
export function includeLotInExpiryAlert(opts: {
  byPolicy: boolean;
  expiryDate: string | null | undefined;
  expiryAlertPolicy: string;
  todayYmd?: string;
}): boolean {
  if (!opts.expiryDate) return false;
  const today = opts.todayYmd ?? inventoryTodayYmd();
  const expiry = opts.expiryDate.slice(0, 10);
  if (isLotExpired(expiry, today)) return true;
  if (!opts.byPolicy) return true;
  const policyDays =
    opts.expiryAlertPolicy === 'd30'
      ? 30
      : opts.expiryAlertPolicy === 'd60'
        ? 60
        : opts.expiryAlertPolicy === 'd90'
          ? 90
          : null;
  if (policyDays == null) return false;
  return daysUntilYmd(expiry, today) <= policyDays;
}

export const LOT_EXPIRED_CREATE_MSG = 'Não é permitido cadastrar lote com validade vencida.';
/** Bloqueio compartilhado: venda, comanda e consumo clínico. */
export const LOT_EXPIRED_SALE_MSG = 'Não é permitido usar lote vencido.';
