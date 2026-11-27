/**
 * Auto-close / notas de handoff — sem importar app HTTP (evita suite quebrada por TS em outros controllers).
 */
jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

const leavePendingMock = jest.fn();
jest.mock('../hubComandasController', () => ({
  leavePendingHandoffOpenComandasForUnit: (...args: unknown[]) => leavePendingMock(...args),
}));

import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  appendHandoffErrorsToNotes,
  closeCashSession,
  formatAutoCloseNotes,
  runAutoCloseOverdueJob,
  ymdSaoPaulo,
} from '../cashSessionCloseService';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111101';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222201';
const CASH_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';

function daysAgoIso(days: number, hourUtc = 15): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

describe('appendHandoffErrorsToNotes', () => {
  it('mantém base sem erros', () => {
    expect(appendHandoffErrorsToNotes('base', [])).toBe('base');
  });

  it('anexa resumo com contagem e mensagens', () => {
    const out = appendHandoffErrorsToNotes(formatAutoCloseNotes(new Date('2026-06-15T03:05:00.000Z')), [
      'abcd1234: Marque a execução do serviço antes de cobrar.',
    ]);
    expect(out).toMatch(/Fechado automaticamente/);
    expect(out).toMatch(/Handoff com pendências \(1\)/);
    expect(out).toMatch(/Marque a execução/);
  });

  it('trunca notes muito longas', () => {
    const longErr = 'x'.repeat(5000);
    const out = appendHandoffErrorsToNotes('base', [longErr]);
    expect(out.length).toBeLessThanOrEqual(3900);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('closeCashSession / auto-close com handoff falho', () => {
  beforeEach(() => {
    leavePendingMock.mockReset();
    leavePendingMock.mockResolvedValue({
      handoff_count: 0,
      skipped_count: 0,
      results: [],
      errors: ['abcd1234: Marque a execução do serviço antes de cobrar.'],
    });
    configureSupabaseMock({
      tables: {
        hub_cash_sessions: [
          {
            id: CASH_SESSION_ID,
            clinic_id: TEST_CLINIC_ID,
            unit_id: TEST_UNIT_ID,
            status: 'open',
            opening_balance: 100,
            opened_at: daysAgoIso(1),
            auto_closed: false,
            notes: null,
          },
        ],
        hub_payments: [],
        hub_cash_movements: [],
        hub_customer_credit_movements: [],
        hub_comandas: [],
      },
    });
  });

  it('fecha manualmente mesmo com erros de handoff e devolve auto_handoff_errors', async () => {
    const result = await closeCashSession({
      sessionId: CASH_SESSION_ID,
      clinicId: TEST_CLINIC_ID,
      closingBalance: 100,
      autoClosed: false,
      notes: 'manual',
      abortOnHandoffErrors: false,
    });
    expect(result.cash_session.status).toBe('closed');
    expect(result.auto_handoff_errors).toEqual([
      'abcd1234: Marque a execução do serviço antes de cobrar.',
    ]);
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('closed');
    expect(String(sess?.notes ?? '')).toBe('manual');
  });

  it('auto-close fecha com notes de pendência de handoff', async () => {
    const today = ymdSaoPaulo();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const result = await runAutoCloseOverdueJob({});
    expect(result.closed_count).toBe(1);
    expect(result.errors).toEqual([]);
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('closed');
    expect(sess?.auto_closed).toBe(true);
    expect(String(sess?.notes ?? '')).toMatch(/Fechado automaticamente/);
    expect(String(sess?.notes ?? '')).toMatch(/Handoff com pendências/);
    expect(result.sessions[0]?.reason).toBe('handoff_errors:1');
  });
});
