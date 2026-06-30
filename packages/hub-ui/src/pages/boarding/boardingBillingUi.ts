export function shouldShowBoardingBillingButton(opts: {
  stage: string;
  canManageFinance?: boolean;
  reservationId?: string | null;
}): boolean {
  return Boolean(opts.canManageFinance && opts.reservationId && opts.stage === 'checked_out');
}
