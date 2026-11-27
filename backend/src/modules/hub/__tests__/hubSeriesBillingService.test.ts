jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);

import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  addDaysYmd,
  calendarMonthBounds,
  findPeriodicInvoiceSeriesAppointments,
  firstBusinessDayOfMonth,
  isAppointmentPendingPeriodicSeriesInvoice,
  normalizeSeriesBillingForInsert,
  resolveDueDate,
  resolveIssueDate,
  resolveSeriesInvoiceDiscount,
} from '../hubSeriesBillingService';

const SERIES_PERIODIC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const SERIES_PER_OCC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002';
const APPT_PERIODIC = 'cccccccc-cccc-4ccc-8ccc-cccccccc0003';
const APPT_PER_OCC = 'dddddddd-dddd-4ddd-8ddd-dddddddd0004';
const APPT_NO_SERIES = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0005';
const CLINIC = '11111111-1111-4111-8111-111111111111';

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
    expect(normalizeSeriesBillingForInsert({ billing_mode: 'per_occurrence' }).invoice_discount_percent).toBe(
      0,
    );
    const periodic = normalizeSeriesBillingForInsert({
      billing_mode: 'periodic_invoice',
      invoice_issue_rule: 'first_business_day',
      invoice_due_rule: 'same_day',
      invoice_discount_percent: 10,
    });
    expect(periodic.billing_mode).toBe('periodic_invoice');
    expect(periodic.invoice_cycle).toBe('calendar_month');
    expect(periodic.invoice_issue_rule).toBe('first_business_day');
    expect(periodic.invoice_discount_percent).toBe(10);
  });
});

describe('resolveSeriesInvoiceDiscount', () => {
  it('10% de 200 = desconto 20 e líquido 180', () => {
    expect(resolveSeriesInvoiceDiscount({ subtotal: 200, percent: 10 })).toEqual({
      discount: 20,
      net: 180,
    });
  });

  it('percent 0 → sem desconto', () => {
    expect(resolveSeriesInvoiceDiscount({ subtotal: 200, percent: 0 })).toEqual({
      discount: 0,
      net: 200,
    });
  });

  it('override absoluto ganha do percent', () => {
    expect(
      resolveSeriesInvoiceDiscount({ subtotal: 200, percent: 10, overrideAmount: 30 }),
    ).toEqual({ discount: 30, net: 170 });
  });

  it('desconto não passa do subtotal', () => {
    expect(
      resolveSeriesInvoiceDiscount({ subtotal: 50, percent: 100, overrideAmount: 999 }),
    ).toEqual({ discount: 50, net: 0 });
  });
});

describe('findPeriodicInvoiceSeriesAppointments', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        hub_appointments: [
          {
            id: APPT_PERIODIC,
            clinic_id: CLINIC,
            series_id: SERIES_PERIODIC,
            deleted_at: null,
          },
          {
            id: APPT_PER_OCC,
            clinic_id: CLINIC,
            series_id: SERIES_PER_OCC,
            deleted_at: null,
          },
          {
            id: APPT_NO_SERIES,
            clinic_id: CLINIC,
            series_id: null,
            deleted_at: null,
          },
        ],
        hub_appointment_series: [
          { id: SERIES_PERIODIC, clinic_id: CLINIC, billing_mode: 'periodic_invoice' },
          { id: SERIES_PER_OCC, clinic_id: CLINIC, billing_mode: 'per_occurrence' },
        ],
        hub_series_invoice_items: [],
        hub_series_invoices: [],
      },
    });
  });

  it('marca só agendamentos de série periodic_invoice', async () => {
    const set = await findPeriodicInvoiceSeriesAppointments([
      APPT_PERIODIC,
      APPT_PER_OCC,
      APPT_NO_SERIES,
    ]);
    expect(set.has(APPT_PERIODIC)).toBe(true);
    expect(set.has(APPT_PER_OCC)).toBe(false);
    expect(set.has(APPT_NO_SERIES)).toBe(false);
  });

  it('isAppointmentPendingPeriodicSeriesInvoice = true sem fatura emitida', async () => {
    const r = await isAppointmentPendingPeriodicSeriesInvoice(APPT_PERIODIC);
    expect(r.pending).toBe(true);
    expect(r.seriesInvoiceComandaId).toBeNull();
  });

  it('isAppointmentPendingPeriodicSeriesInvoice = false para per_occurrence', async () => {
    const r = await isAppointmentPendingPeriodicSeriesInvoice(APPT_PER_OCC);
    expect(r.pending).toBe(false);
  });

  it('com fatura emitida: pending false e comanda da fatura', async () => {
    const invoiceId = 'ffffffff-ffff-4fff-8fff-ffffffff0006';
    const comandaId = '99999999-9999-4999-8999-999999999999';
    configureSupabaseMock({
      tables: {
        hub_appointments: [
          {
            id: APPT_PERIODIC,
            clinic_id: CLINIC,
            series_id: SERIES_PERIODIC,
            deleted_at: null,
          },
        ],
        hub_appointment_series: [
          { id: SERIES_PERIODIC, clinic_id: CLINIC, billing_mode: 'periodic_invoice' },
        ],
        hub_series_invoices: [
          { id: invoiceId, series_id: SERIES_PERIODIC, status: 'issued', comanda_id: comandaId },
        ],
        hub_series_invoice_items: [
          {
            appointment_id: APPT_PERIODIC,
            series_invoice_id: invoiceId,
            invoice: { id: invoiceId, status: 'issued', comanda_id: comandaId },
          },
        ],
      },
    });
    const r = await isAppointmentPendingPeriodicSeriesInvoice(APPT_PERIODIC);
    expect(r.pending).toBe(false);
    expect(r.seriesInvoiceComandaId).toBe(comandaId);
  });
});
