import {
  addDaysYmd,
  calendarMonthBounds,
  firstBusinessDayOfMonth,
  normalizeSeriesBillingForInsert,
  resolveDueDate,
  resolveIssueDate,
} from '../hubSeriesBillingService';

describe('hubSeriesBillingService dates', () => {
  it('resolve first business day (skip weekend)', () => {
    // 2026-08-01 is Saturday → Monday 03
    expect(firstBusinessDayOfMonth(2026, 8)).toBe('2026-08-03');
    // 2026-09-01 is Tuesday
    expect(firstBusinessDayOfMonth(2026, 9)).toBe('2026-09-01');
  });

  it('calendar month bounds', () => {
    expect(calendarMonthBounds('2026-09-15')).toEqual({
      period_start: '2026-09-01',
      period_end: '2026-09-30',
    });
  });

  it('resolve issue and due dates', () => {
    const issue = resolveIssueDate('2026-09-01', {
      billing_mode: 'periodic_invoice',
      invoice_issue_rule: 'fixed_day',
      invoice_issue_day: 5,
    });
    expect(issue).toBe('2026-09-05');
    expect(
      resolveDueDate(issue, {
        billing_mode: 'periodic_invoice',
        invoice_due_rule: 'plus_days',
        invoice_due_plus_days: 7,
      })
    ).toBe('2026-09-12');
    expect(addDaysYmd('2026-09-28', 5)).toBe('2026-10-03');
  });

  it('normalize billing for insert', () => {
    expect(normalizeSeriesBillingForInsert({ billing_mode: 'per_occurrence' }).billing_mode).toBe(
      'per_occurrence'
    );
    const periodic = normalizeSeriesBillingForInsert({
      billing_mode: 'periodic_invoice',
      invoice_issue_rule: 'first_business_day',
      invoice_due_rule: 'same_day',
    });
    expect(periodic.billing_mode).toBe('periodic_invoice');
    expect(periodic.invoice_cycle).toBe('calendar_month');
    expect(periodic.invoice_issue_rule).toBe('first_business_day');
  });
});
