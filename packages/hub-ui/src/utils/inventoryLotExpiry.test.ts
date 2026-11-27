import { describe, expect, it } from 'vitest';
import {
  isLotExpired,
  LOT_EXPIRED_CREATE_MSG,
  LOT_EXPIRED_SALE_MSG,
  inventoryTodayYmd,
} from './inventoryLotExpiry';

describe('inventoryLotExpiry', () => {
  const today = '2026-11-27';

  it('isLotExpired: validade no passado', () => {
    expect(isLotExpired('2025-01-01', today)).toBe(true);
    expect(isLotExpired('2026-11-26', today)).toBe(true);
  });

  it('isLotExpired: hoje ou futuro não é vencido', () => {
    expect(isLotExpired('2026-11-27', today)).toBe(false);
    expect(isLotExpired('2027-01-01', today)).toBe(false);
  });

  it('isLotExpired: sem data não é vencido', () => {
    expect(isLotExpired(null, today)).toBe(false);
    expect(isLotExpired('', today)).toBe(false);
    expect(isLotExpired(undefined, today)).toBe(false);
  });

  it('mensagens de bloqueio estão em português', () => {
    expect(LOT_EXPIRED_CREATE_MSG).toMatch(/validade vencida/i);
    expect(LOT_EXPIRED_SALE_MSG).toMatch(/usar lote vencido/i);
  });

  it('inventoryTodayYmd retorna YYYY-MM-DD', () => {
    expect(inventoryTodayYmd(new Date('2026-11-27T15:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
