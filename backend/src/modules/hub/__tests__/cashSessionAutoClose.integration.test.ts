/**
 * Fechamento automático overdue de caixa + close atômico / concorrência.
 */
jest.mock('../../../config/supabase', () => require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule());
jest.mock('../../../middleware/authMiddleware', () =>
  require('../../../__tests__/helpers/authTestDouble').getAuthMiddlewareModule()
);

const leavePendingMock = jest.fn();
jest.mock('../hubComandasController', () => {
  const actual = jest.requireActual('../hubComandasController') as Record<string, unknown>;
  return {
    ...actual,
    leavePendingHandoffOpenComandasForUnit: (...args: unknown[]) => leavePendingMock(...args),
  };
});

import request from 'supertest';
import app from '../../../app';
import { configureSupabaseMock, getMockSupabaseClient } from '../../../__tests__/helpers/supabaseTestDouble';
import { betaClinicSubscription } from '../../../__tests__/helpers/fixtures/hubSubscription';
import {
  closeCashSession,
  formatAutoCloseNotes,
  isCronClinicFilterAllowed,
  listOverdueOpenCashSessions,
  runAutoCloseOverdueJob,
  verifyCronSecret,
  ymdSaoPaulo,
} from '../cashSessionCloseService';

const TEST_CLINIC_ID = '11111111-1111-4111-8111-111111111101';
const TEST_UNIT_ID = '22222222-2222-4222-8222-222222222201';
const TEST_UNIT_ID_2 = '22222222-2222-4222-8222-222222222202';
const CASH_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const CASH_SESSION_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002';
const CASH_SESSION_OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003';
const CRON_SECRET = 'test-cron-secret-value-32chars-xx';

function daysAgoIso(days: number, hourUtc = 15): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

function todaySpMorningIso(): string {
  // ~12:00 SP ≈ 15:00 UTC (UTC−3) — sempre "hoje" em SP
  const today = ymdSaoPaulo();
  return `${today}T15:00:00.000Z`;
}

function cashSession(overrides: Record<string, unknown> = {}) {
  return {
    id: CASH_SESSION_ID,
    clinic_id: TEST_CLINIC_ID,
    unit_id: TEST_UNIT_ID,
    status: 'open',
    opening_balance: 100,
    opened_at: daysAgoIso(1),
    auto_closed: false,
    notes: null,
    ...overrides,
  };
}

function baseTables(sessions: Record<string, unknown>[], extra: Record<string, unknown[]> = {}) {
  return {
    clinic_hub_subscriptions: [betaClinicSubscription(TEST_CLINIC_ID)],
    hub_cash_sessions: sessions,
    hub_payments: [] as Record<string, unknown>[],
    hub_cash_movements: [] as Record<string, unknown>[],
    hub_customer_credit_movements: [] as Record<string, unknown>[],
    hub_comandas: [] as Record<string, unknown>[],
    ...extra,
  };
}

describe('cashSessionCloseService — auto-close overdue', () => {
  const prevCron = process.env.CRON_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    leavePendingMock.mockReset();
    leavePendingMock.mockResolvedValue({
      handoff_count: 1,
      skipped_count: 0,
      results: [],
      errors: [],
    });
  });

  afterEach(() => {
    process.env.CRON_SECRET = prevCron;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it('verifyCronSecret rejeita valores divergentes sem vazar timing trivial', () => {
    expect(verifyCronSecret(CRON_SECRET, CRON_SECRET)).toBe(true);
    expect(verifyCronSecret('wrong', CRON_SECRET)).toBe(false);
    expect(verifyCronSecret(null, CRON_SECRET)).toBe(false);
    expect(verifyCronSecret(CRON_SECRET, null)).toBe(false);
  });

  it('formatAutoCloseNotes menciona fechamento automático sem contagem física', () => {
    expect(formatAutoCloseNotes(new Date('2026-06-15T03:05:00.000Z'))).toMatch(/Fechado automaticamente/);
    expect(formatAutoCloseNotes(new Date('2026-06-15T03:05:00.000Z'))).toMatch(/sem contagem física/);
  });

  it('lista sessão de ontem e sessão antiga; ignora sessão aberta hoje (SP)', async () => {
    configureSupabaseMock({
      tables: baseTables([
        cashSession({ id: CASH_SESSION_ID, opened_at: daysAgoIso(1) }),
        cashSession({ id: CASH_SESSION_OLD, unit_id: TEST_UNIT_ID_2, opened_at: daysAgoIso(5) }),
        cashSession({
          id: CASH_SESSION_ID_2,
          unit_id: '22222222-2222-4222-8222-222222222203',
          opened_at: todaySpMorningIso(),
        }),
      ]),
    });

    const list = await listOverdueOpenCashSessions();
    const ids = list.map((s) => s.id).sort();
    expect(ids).toEqual([CASH_SESSION_ID, CASH_SESSION_OLD].sort());
  });

  it('fecha sessão antiga com auto_closed, diff 0 e closing = expected', async () => {
    configureSupabaseMock({
      tables: baseTables(
        [cashSession({ id: CASH_SESSION_OLD, opened_at: daysAgoIso(4), opening_balance: 50 })],
        {
          hub_payments: [
            {
              id: '44444444-4444-4444-8444-444444444401',
              clinic_id: TEST_CLINIC_ID,
              cash_session_id: CASH_SESSION_OLD,
              payment_method: 'cash',
              status: 'posted',
              posting_kind: 'operational',
              amount: 25,
            },
          ],
        },
      ),
    });

    const result = await runAutoCloseOverdueJob({});
    expect(result.closed_count).toBe(1);
    expect(result.errors).toEqual([]);
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('closed');
    expect(sess?.auto_closed).toBe(true);
    expect(Number(sess?.expected_balance)).toBe(75);
    expect(Number(sess?.closing_balance)).toBe(75);
    expect(Number(sess?.difference_amount)).toBe(0);
    expect(String(sess?.notes ?? '')).toMatch(/Fechado automaticamente/);
    expect(leavePendingMock).toHaveBeenCalledTimes(1);
  });

  it('sessão criada após 00:00 BRT hoje não fecha', async () => {
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: todaySpMorningIso() })]),
    });
    const result = await runAutoCloseOverdueJob({});
    expect(result.candidate_count).toBe(0);
    expect(result.closed_count).toBe(0);
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('open');
    expect(leavePendingMock).not.toHaveBeenCalled();
  });

  it('segunda execução é no-op (idempotente)', async () => {
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(1) })]),
    });
    const first = await runAutoCloseOverdueJob({});
    expect(first.closed_count).toBe(1);
    leavePendingMock.mockClear();
    const second = await runAutoCloseOverdueJob({});
    expect(second.closed_count).toBe(0);
    expect(second.candidate_count).toBe(0);
    expect(leavePendingMock).not.toHaveBeenCalled();
  });

  it('duas execuções concorrentes fecham uma única vez', async () => {
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(2) })]),
    });
    const [a, b] = await Promise.all([runAutoCloseOverdueJob({}), runAutoCloseOverdueJob({})]);
    const closedTotal = a.closed_count + b.closed_count;
    expect(closedTotal).toBe(1);
    const openCount = (getMockSupabaseClient()._state.tables.hub_cash_sessions ?? []).filter(
      (s) => s.status === 'open',
    ).length;
    expect(openCount).toBe(0);
  });

  it('falha crítica no handoff não marca a sessão como fechada', async () => {
    leavePendingMock.mockResolvedValue({
      handoff_count: 0,
      skipped_count: 0,
      results: [],
      errors: ['abcd1234: Comanda não está aberta'],
    });
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(1) })]),
    });
    const result = await runAutoCloseOverdueJob({});
    expect(result.closed_count).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('open');
    expect(sess?.auto_closed).toBe(false);
  });

  it('dry_run não escreve nada (nem handoff nem close)', async () => {
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(1) })]),
    });
    const result = await runAutoCloseOverdueJob({ dryRun: true });
    expect(result.dry_run).toBe(true);
    expect(result.candidate_count).toBe(1);
    expect(result.closed_count).toBe(0);
    expect(result.sessions[0]?.status).toBe('would_close');
    expect(leavePendingMock).not.toHaveBeenCalled();
    const sess = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(sess?.status).toBe('open');
  });

  it('close manual e automático concorrentes: só um vence', async () => {
    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(1), opening_balance: 10 })]),
    });
    const manual = closeCashSession({
      sessionId: CASH_SESSION_ID,
      clinicId: TEST_CLINIC_ID,
      closingBalance: 12,
      autoClosed: false,
      notes: 'manual',
      abortOnHandoffErrors: false,
    });
    const auto = closeCashSession({
      sessionId: CASH_SESSION_ID,
      clinicId: TEST_CLINIC_ID,
      closingBalance: null,
      autoClosed: true,
      abortOnHandoffErrors: true,
    });
    const results = await Promise.allSettled([manual, auto]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
      cash_session: { status: string; auto_closed?: boolean; notes?: string | null };
      already_closed?: boolean;
    }>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const closed = getMockSupabaseClient()._state.tables.hub_cash_sessions?.[0];
    expect(closed?.status).toBe('closed');
    // exatamente um snapshot final
    const winners = fulfilled.filter((r) => !r.value.already_closed);
    expect(winners.length).toBeLessThanOrEqual(1);
  });

  it('endpoint exige CRON_SECRET', async () => {
    configureSupabaseMock({ tables: baseTables([]) });
    const unauthorized = await request(app)
      .post('/api/hub/finance/cash-sessions/auto-close-overdue')
      .send({ dry_run: true });
    expect(unauthorized.status).toBe(401);

    const ok = await request(app)
      .post('/api/hub/finance/cash-sessions/auto-close-overdue')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .send({ dry_run: true });
    expect(ok.status).toBe(200);
    expect(ok.body.dry_run).toBe(true);
  });

  it('clinic_id só é permitido fora de production', async () => {
    expect(isCronClinicFilterAllowed('production')).toBe(false);
    expect(isCronClinicFilterAllowed('staging')).toBe(true);
    expect(isCronClinicFilterAllowed('test')).toBe(true);

    configureSupabaseMock({
      tables: baseTables([cashSession({ opened_at: daysAgoIso(1) })]),
    });
    const res = await request(app)
      .post('/api/hub/finance/cash-sessions/auto-close-overdue')
      .set('X-Cron-Secret', CRON_SECRET)
      .send({ dry_run: true, clinic_id: TEST_CLINIC_ID });
    expect(res.status).toBe(200);
    expect(res.body.candidate_count).toBe(1);
  });
});
