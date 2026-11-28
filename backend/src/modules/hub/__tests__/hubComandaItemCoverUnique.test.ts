import {
  COMANDA_ITEM_ALREADY_BILLED_MESSAGE,
  isComandaItemCoverUniqueViolation,
} from '../hubComandaItemCoverUnique';
import { CHARGEABLE_RECEIVABLE_STATUSES } from '../hubReceivableCancelCoverage';

describe('hubComandaItemCoverUnique', () => {
  it('reconhece 23505 do índice P2-05', () => {
    expect(isComandaItemCoverUniqueViolation({ code: '23505', message: '' })).toBe(true);
    expect(
      isComandaItemCoverUniqueViolation({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "uniq_hub_receivable_lines_comanda_item_cover"',
      }),
    ).toBe(true);
    expect(
      isComandaItemCoverUniqueViolation({
        message: 'uniq_hub_receivable_lines_comanda_item_cover',
      }),
    ).toBe(true);
    expect(isComandaItemCoverUniqueViolation({ code: '23503', message: 'fk' })).toBe(false);
    expect(isComandaItemCoverUniqueViolation(null)).toBe(false);
  });

  it('expõe mensagem operacional estável', () => {
    expect(COMANDA_ITEM_ALREADY_BILLED_MESSAGE).toMatch(/já foi faturada/i);
  });
});

describe('CHARGEABLE_RECEIVABLE_STATUSES (P2-05)', () => {
  it('não inclui cancelled nem refunded', () => {
    expect([...CHARGEABLE_RECEIVABLE_STATUSES]).toEqual(['pending', 'partially_paid', 'paid']);
    expect(CHARGEABLE_RECEIVABLE_STATUSES).not.toContain('cancelled');
    expect(CHARGEABLE_RECEIVABLE_STATUSES).not.toContain('refunded');
  });
});
