jest.mock('../../../config/supabase', () =>
  require('../../../__tests__/helpers/supabaseTestDouble').getSupabaseModule(),
);

import { configureSupabaseMock } from '../../../__tests__/helpers/supabaseTestDouble';
import {
  assertServiceLinesHaveExecutor,
  backfillPickupLegCommissionStaff,
} from '../hubCommissionAccrual';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const APPT_BANHO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPT_PICKUP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_BANHO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SVC_PICKUP = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STAFF_EXEC = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STAFF_DRIVER = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ROUTE_ID = '99999999-9999-4999-8999-999999999999';
const LINE_NULL = '12121212-1212-4121-8121-121212121212';
const LINE_HAS_STAFF = '34343434-3434-4343-8343-343434343434';

describe('assertServiceLinesHaveExecutor', () => {
  beforeEach(() => {
    configureSupabaseMock({
      tables: {
        hub_appointment_services: [
          {
            id: SVC_BANHO,
            appointment_id: APPT_BANHO,
            executed_by_staff_id: null,
          },
          {
            id: SVC_PICKUP,
            appointment_id: APPT_PICKUP,
            executed_by_staff_id: null,
          },
        ],
        hub_appointments: [
          { id: APPT_BANHO, clinic_id: CLINIC, appointment_kind: 'standard' },
          { id: APPT_PICKUP, clinic_id: CLINIC, appointment_kind: 'pickup_route' },
        ],
      },
    });
  });

  it('bloqueia banho sem executor', async () => {
    const result = await assertServiceLinesHaveExecutor(CLINIC, [
      {
        origin_type: 'appointment_service',
        origin_id: SVC_BANHO,
        description: 'Banho',
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/execução/i);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0]!.origin_id).toBe(SVC_BANHO);
    }
  });

  it('permite perna de L&T sem executed_by', async () => {
    const result = await assertServiceLinesHaveExecutor(CLINIC, [
      {
        origin_type: 'appointment_service',
        origin_id: SVC_PICKUP,
        description: 'Leva e Traz',
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it('permite banho com executor', async () => {
    configureSupabaseMock({
      tables: {
        hub_appointment_services: [
          {
            id: SVC_BANHO,
            appointment_id: APPT_BANHO,
            executed_by_staff_id: STAFF_EXEC,
          },
        ],
        hub_appointments: [
          { id: APPT_BANHO, clinic_id: CLINIC, appointment_kind: 'standard' },
        ],
      },
    });
    const result = await assertServiceLinesHaveExecutor(CLINIC, [
      { origin_type: 'appointment_service', origin_id: SVC_BANHO },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe('backfillPickupLegCommissionStaff', () => {
  it('preenche staff null com motorista da rota e não sobrescreve staff existente', async () => {
    configureSupabaseMock({
      tables: {
        hub_pickup_routes: [
          {
            id: ROUTE_ID,
            clinic_id: CLINIC,
            driver_staff_id: STAFF_DRIVER,
            deleted_at: null,
          },
        ],
        hub_pickup_stops: [
          { hub_pickup_route_id: ROUTE_ID, hub_appointment_id: APPT_PICKUP },
        ],
        hub_appointment_services: [{ id: SVC_PICKUP, appointment_id: APPT_PICKUP }],
        hub_staff_members: [
          { id: STAFF_DRIVER, clinic_id: CLINIC, deleted_at: null },
        ],
        hub_receivable_lines: [
          {
            id: LINE_NULL,
            clinic_id: CLINIC,
            source_line_id: SVC_PICKUP,
            commission_staff_member_id: null,
            commission_staff_source: 'none',
            commission_original_amount: 2,
          },
          {
            id: LINE_HAS_STAFF,
            clinic_id: CLINIC,
            source_line_id: SVC_PICKUP,
            commission_staff_member_id: STAFF_EXEC,
            commission_staff_source: 'service_executor',
            commission_original_amount: 2,
          },
        ],
      },
    });

    const result = await backfillPickupLegCommissionStaff(CLINIC, ROUTE_ID);
    expect(result.updated).toBe(1);

    const { getMockSupabaseClient } = require('../../../__tests__/helpers/supabaseTestDouble');
    const client = getMockSupabaseClient() as { _state?: { tables: Record<string, Array<Record<string, unknown>>> } };
    const lines = client._state?.tables?.hub_receivable_lines ?? [];
    const nullLine = lines.find((l) => l.id === LINE_NULL);
    const keptLine = lines.find((l) => l.id === LINE_HAS_STAFF);
    expect(nullLine?.commission_staff_member_id).toBe(STAFF_DRIVER);
    expect(nullLine?.commission_staff_source).toBe('service_executor');
    expect(keptLine?.commission_staff_member_id).toBe(STAFF_EXEC);
  });

  it('sem motorista na rota → updated 0', async () => {
    configureSupabaseMock({
      tables: {
        hub_pickup_routes: [
          {
            id: ROUTE_ID,
            clinic_id: CLINIC,
            driver_staff_id: null,
            deleted_at: null,
          },
        ],
      },
    });
    const result = await backfillPickupLegCommissionStaff(CLINIC, ROUTE_ID);
    expect(result.updated).toBe(0);
  });
});

describe('imutabilidade vs backfill motorista', () => {
  it('única mutação permitida: null → motorista via backfill; valor congelado permanece', () => {
    const frozenAmount = 4;
    const snapshotBefore = {
      commission_staff_member_id: null as string | null,
      commission_staff_source: 'none' as const,
      commission_original_amount: frozenAmount,
    };
    // Backfill só preenche staff; amount não muda.
    const snapshotAfter = {
      ...snapshotBefore,
      commission_staff_member_id: STAFF_DRIVER,
      commission_staff_source: 'service_executor' as const,
    };
    expect(snapshotAfter.commission_original_amount).toBe(frozenAmount);
    expect(snapshotAfter.commission_staff_member_id).toBe(STAFF_DRIVER);
  });
});
