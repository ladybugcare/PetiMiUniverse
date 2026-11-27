import { describe, expect, it } from 'vitest';
import {
  inventoryTodayYmd,
  isLotExpired,
  LOT_EXPIRED_CREATE_MSG,
  LOT_EXPIRED_SALE_MSG,
} from '../hubInventoryExpiryUtils';

describe('hubInventoryExpiryUtils', () => {
  it('inventoryTodayYmd formata YYYY-MM-DD local', () => {
    const fixed = new Date(2026, 10, 27, 15, 0, 0); // 27/11/2026 local
    expect(inventoryTodayYmd(fixed)).toBe('2026-11-27');
  });

  it('isLotExpired: nulo ou vazio não está vencido', () => {
    expect(isLotExpired(null, '2026-11-27')).toBe(false);
    expect(isLotExpired(undefined, '2026-11-27')).toBe(false);
    expect(isLotExpired('', '2026-11-27')).toBe(false);
  });

  it('isLotExpired: ontem vencido; hoje e futuro ok', () => {
    expect(isLotExpired('2026-11-26', '2026-11-27')).toBe(true);
    expect(isLotExpired('2026-11-27', '2026-11-27')).toBe(false);
    expect(isLotExpired('2026-11-28', '2026-11-27')).toBe(false);
  });

  it('mensagens de bloqueio em pt-BR', () => {
    expect(LOT_EXPIRED_CREATE_MSG).toMatch(/cadastrar lote/i);
    expect(LOT_EXPIRED_SALE_MSG).toMatch(/vender.*lote vencido/i);
  });
});
