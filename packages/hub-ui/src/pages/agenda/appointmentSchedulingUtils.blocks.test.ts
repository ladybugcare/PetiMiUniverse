import { describe, expect, it } from 'vitest';
import {
  buildExtraBlocksApiPayload,
  createEmptyExtraBlock,
  defaultBlockRecurrence,
} from './appointmentSchedulingUtils';

describe('buildExtraBlocksApiPayload — blocos independentes', () => {
  it('inclui recurrence e checkout multi-dia do hotel', () => {
    const block = createEmptyExtraBlock({
      groupFilter: 'hotel',
      startsHm: '14:00',
      staffId: '',
      resourceLabel: '',
      startsDateYmd: '2026-04-01',
    });
    block.services = [
      {
        hub_service_type_id: 'svc-hotel',
        name: 'Diária',
        duration_minutes: 60,
      },
    ];
    block.checkout_date_ymd = '2026-04-30';
    block.checkout_hm = '11:00';
    block.recurrence = { ...defaultBlockRecurrence(), enabled: true, kind: 'biweekly', occurrences: 4 };

    const payload = buildExtraBlocksApiPayload([block], '2026-04-01', '2026-04-01T14:00:00.000Z');
    expect(payload).toHaveLength(1);
    expect(payload![0]!.ends_at.startsWith('2026-04-30')).toBe(true);
    expect(payload![0]!.recurrence).toMatchObject({
      kind: 'weekly',
      interval_value: 2,
      occurrences: 4,
    });
  });

  it('banho no dia da saída não é empurrado pelo fim da estadia', () => {
    const bath = createEmptyExtraBlock({
      groupFilter: 'banho_tosa',
      startsHm: '09:00',
      staffId: '',
      resourceLabel: '',
      startsDateYmd: '2026-06-03',
    });
    bath.services = [
      {
        hub_service_type_id: 'svc-banho',
        name: 'Banho',
        duration_minutes: 60,
      },
    ];
    bath.ends_hm = '10:00';

    // Pai hotel: entrada 01/06 14h, saída 03/06 12h → cursor = fim da estadia (depois das 09h).
    const hotelEndsAt = '2026-06-03T15:00:00.000Z'; // 12:00 SP
    const payload = buildExtraBlocksApiPayload([bath], '2026-06-01', hotelEndsAt);
    expect(payload).toHaveLength(1);
    const start = new Date(payload![0]!.starts_at);
    const end = new Date(payload![0]!.ends_at);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // junho
    expect(start.getDate()).toBe(3);
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(10);
  });

  it('sem starts_date_ymd ainda encadeia pelo cursor no dia do agendamento', () => {
    const block = createEmptyExtraBlock({
      groupFilter: 'banho_tosa',
      startsHm: '16:00',
      staffId: '',
      resourceLabel: '',
    });
    block.services = [
      {
        hub_service_type_id: 'svc-banho',
        name: 'Banho',
        duration_minutes: 60,
      },
    ];
    block.ends_hm = '17:00';
    // Cursor 14:00 local no dia 01 → 16:00 fica no mesmo dia.
    const cursor = new Date(2026, 5, 1, 14, 0, 0, 0).toISOString();
    const payload = buildExtraBlocksApiPayload([block], '2026-06-01', cursor);
    const start = new Date(payload![0]!.starts_at);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(16);
  });
});
