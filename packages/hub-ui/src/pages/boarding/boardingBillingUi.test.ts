import { describe, expect, it } from 'vitest';
import { shouldShowBoardingBillingButton } from './boardingBillingUi';

describe('shouldShowBoardingBillingButton', () => {
  it('exibe quando checked_out com permissão e reserva', () => {
    expect(
      shouldShowBoardingBillingButton({
        stage: 'checked_out',
        canManageFinance: true,
        reservationId: 'res-1',
      })
    ).toBe(true);
  });

  it('oculta sem permissão financeira', () => {
    expect(
      shouldShowBoardingBillingButton({
        stage: 'checked_out',
        canManageFinance: false,
        reservationId: 'res-1',
      })
    ).toBe(false);
  });

  it('oculta antes do check-out', () => {
    expect(
      shouldShowBoardingBillingButton({
        stage: 'checked_in',
        canManageFinance: true,
        reservationId: 'res-1',
      })
    ).toBe(false);
  });

  it('oculta sem reservation_id', () => {
    expect(
      shouldShowBoardingBillingButton({
        stage: 'checked_out',
        canManageFinance: true,
        reservationId: null,
      })
    ).toBe(false);
  });
});
