import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  daysUntilYmd,
  includeLotInExpiryAlert,
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

  it('addDaysYmd soma dias em calendário local', () => {
    expect(addDaysYmd('2026-11-27', 30)).toBe('2026-12-27');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('daysUntilYmd: negativo quando vencido', () => {
    expect(daysUntilYmd('2025-01-01', '2026-11-27')).toBeLessThan(0);
    expect(daysUntilYmd('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysUntilYmd('2026-11-28', '2026-11-27')).toBe(1);
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

  it('includeLotInExpiryAlert: vencido sempre entra', () => {
    expect(
      includeLotInExpiryAlert({
        byPolicy: true,
        expiryDate: '2025-01-01',
        expiryAlertPolicy: 'none',
        todayYmd: '2026-11-27',
      }),
    ).toBe(true);
    expect(
      includeLotInExpiryAlert({
        byPolicy: false,
        expiryDate: '2025-01-01',
        expiryAlertPolicy: 'none',
        todayYmd: '2026-11-27',
      }),
    ).toBe(true);
  });

  it('includeLotInExpiryAlert: política d60 só na janela', () => {
    expect(
      includeLotInExpiryAlert({
        byPolicy: true,
        expiryDate: '2026-12-10',
        expiryAlertPolicy: 'd60',
        todayYmd: '2026-11-27',
      }),
    ).toBe(true);
    expect(
      includeLotInExpiryAlert({
        byPolicy: true,
        expiryDate: '2027-06-01',
        expiryAlertPolicy: 'd60',
        todayYmd: '2026-11-27',
      }),
    ).toBe(false);
    expect(
      includeLotInExpiryAlert({
        byPolicy: true,
        expiryDate: '2026-12-10',
        expiryAlertPolicy: 'none',
        todayYmd: '2026-11-27',
      }),
    ).toBe(false);
  });

  it('mensagens de bloqueio em pt-BR', () => {
    expect(LOT_EXPIRED_CREATE_MSG).toMatch(/cadastrar lote/i);
    expect(LOT_EXPIRED_SALE_MSG).toMatch(/usar lote vencido/i);
  });
});
