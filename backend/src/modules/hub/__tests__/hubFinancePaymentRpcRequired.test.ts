/**
 * Em ambientes reais, ausência da RPC não pode cair em insert TS (risco de overpay).
 */
import {
  allowPostedPaymentTsFallback,
  insertPostedPaymentWithIdempotency,
} from '../hubFinanceLedger';

jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';

const CLINIC = '11111111-1111-4111-8111-111111111199';
const REC = '22222222-2222-4222-8222-222222222299';

describe('hub_post_payment required outside test fallback', () => {
  const prevFallback = process.env.HUB_PAYMENT_TS_FALLBACK;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevFallback === undefined) delete process.env.HUB_PAYMENT_TS_FALLBACK;
    else process.env.HUB_PAYMENT_TS_FALLBACK = prevFallback;
    process.env.NODE_ENV = prevNodeEnv ?? 'test';
  });

  it('allowPostedPaymentTsFallback é true em test e false com HUB_PAYMENT_TS_FALLBACK=0', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.HUB_PAYMENT_TS_FALLBACK;
    expect(allowPostedPaymentTsFallback()).toBe(true);

    process.env.HUB_PAYMENT_TS_FALLBACK = '0';
    expect(allowPostedPaymentTsFallback()).toBe(false);
  });

  it('RPC ausente + fallback desligado → 503 sem insert', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HUB_PAYMENT_TS_FALLBACK = '0';

    configureSupabaseMock({
      tables: {
        hub_receivables: [
          {
            id: REC,
            clinic_id: CLINIC,
            status: 'pending',
            final_amount: 100,
            deleted_at: null,
          },
        ],
        hub_payments: [],
        hub_clinic_settings: [
          {
            clinic_id: CLINIC,
            accepted_payment_methods: ['pix'],
            card_machine_fees: null,
          },
        ],
      },
    });

    const result = await insertPostedPaymentWithIdempotency({
      clinicId: CLINIC,
      receivableId: REC,
      cashSessionId: null,
      amount: 50,
      paymentMethod: 'pix',
      paymentDate: new Date().toISOString(),
      createdByUserId: null,
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0099',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/hub_post_payment|indisponível/i);
  });
});
