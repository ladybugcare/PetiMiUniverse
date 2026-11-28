import { isAppointmentResourceLiveBusy } from '../hubResourcesService';

describe('isAppointmentResourceLiveBusy', () => {
  const now = '2026-11-28T03:50:00.000Z';

  it('não prende banheira em in_progress órfão após ends_at', () => {
    expect(
      isAppointmentResourceLiveBusy(
        {
          status: 'in_progress',
          starts_at: '2026-11-18T13:45:00.000Z',
          ends_at: '2026-11-18T15:15:00.000Z',
          resource_released_at: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it('mantém in_progress ocupado durante o slot', () => {
    expect(
      isAppointmentResourceLiveBusy(
        {
          status: 'in_progress',
          starts_at: '2026-11-28T03:00:00.000Z',
          ends_at: '2026-11-28T04:00:00.000Z',
          resource_released_at: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it('respeita resource_released_at', () => {
    expect(
      isAppointmentResourceLiveBusy(
        {
          status: 'in_progress',
          starts_at: '2026-11-28T03:00:00.000Z',
          ends_at: '2026-11-28T04:00:00.000Z',
          resource_released_at: '2026-11-28T03:30:00.000Z',
        },
        now,
      ),
    ).toBe(false);
  });
});
