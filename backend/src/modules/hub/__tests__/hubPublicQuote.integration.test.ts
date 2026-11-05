jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule()
);
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';

const CLINIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const QUOTE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
const PUBLIC_TOKEN = 'token-publico-orcamento-teste';

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: QUOTE_ID,
    clinic_id: CLINIC_ID,
    status: 'sent',
    notes: 'nota interna da equipe',
    client_notes: 'obs para o cliente',
    billing_state: 'awaiting_billing',
    billing_waived_at: '2026-01-01T00:00:00.000Z',
    billing_waive_reason: 'cortesia',
    guardian_id: 'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
    public_token: PUBLIC_TOKEN,
    total_amount: 90,
    subtotal_amount: 100,
    discount_kind: 'fixed',
    discount_value: 10,
    currency: 'BRL',
    ...overrides,
  };
}

describe('orçamento público', () => {
  it('GET público omite notas internas e dados de cobrança', async () => {
    configureSupabaseMock({ tables: { hub_quotes: [quoteRow()] } });

    const res = await request(app).get(`/api/public/quotes/${PUBLIC_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.quote.client_notes).toBe('obs para o cliente');
    expect(res.body.quote.notes).toBeUndefined();
    expect(res.body.quote.billing_state).toBeUndefined();
    expect(res.body.quote.billing_waived_at).toBeUndefined();
    expect(res.body.quote.billing_waive_reason).toBeUndefined();
    expect(res.body.quote.guardian_id).toBeUndefined();
  });

  it('rascunho com token responde 404', async () => {
    configureSupabaseMock({ tables: { hub_quotes: [quoteRow({ status: 'draft' })] } });

    const res = await request(app).get(`/api/public/quotes/${PUBLIC_TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('não gera token para rascunho', async () => {
    configureSupabaseMock({
      tables: { hub_quotes: [quoteRow({ status: 'draft', public_token: null })] },
    });

    const res = await request(app)
      .post(`/api/hub/quotes/${QUOTE_ID}/public-token`)
      .query({ clinic_id: CLINIC_ID });

    expect(res.status).toBe(409);
  });
});
