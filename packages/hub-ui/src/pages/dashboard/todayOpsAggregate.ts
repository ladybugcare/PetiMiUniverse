import type { DayBoardItem } from '../../api/hubClinicalApi';
import type { GroomingDayBoardItem } from '../../api/hubGroomingApi';
import type { BoardingDayBoardItem, BoardingOccupancyResponse } from '../../api/hubBoardingApi';
import type { PickupDayBoardItem, PickupRoute } from '../../api/hubPickupApi';
import type { HubAppointmentsServiceGroupStat } from '../../api/hubAppointmentsApi';
import type { HubDayOpsSummary } from './todayOpsTypes';

const CLINIC_WAITING = new Set(['waiting', 'confirmed', 'scheduled', 'checked_in']);
const CLINIC_IN_PROGRESS = new Set(['in_progress']);
const CLINIC_DONE = new Set(['completed', 'done', 'paid']);

const GROOMING_WAITING = new Set(['scheduled', 'checked_in', 'queued']);
const GROOMING_IN_SERVICE = new Set(['in_service', 'finishing']);
const GROOMING_READY = new Set(['ready']);
const GROOMING_DONE = new Set(['delivered', 'closed']);

export function aggregateAgendaStats(items: HubAppointmentsServiceGroupStat[]): NonNullable<HubDayOpsSummary['agenda']> {
  const by_group = items.map((i) => ({
    key: i.service_group,
    label: i.label,
    count: Number(i.count) || 0,
  }));
  const total = by_group.reduce((a, g) => a + g.count, 0);
  return { total, by_group };
}

function clinicBucket(item: DayBoardItem): 'waiting' | 'in_progress' | 'done' | 'other' {
  const status = String(item.status || item.appointment_status || '').toLowerCase();
  if (CLINIC_IN_PROGRESS.has(status)) return 'in_progress';
  if (CLINIC_DONE.has(status)) return 'done';
  if (CLINIC_WAITING.has(status) || !status) return 'waiting';
  return 'other';
}

export function aggregateClinicDayBoard(items: DayBoardItem[]): NonNullable<HubDayOpsSummary['clinic']> {
  let waiting = 0;
  let in_progress = 0;
  let done = 0;
  for (const item of items) {
    const b = clinicBucket(item);
    if (b === 'waiting') waiting += 1;
    else if (b === 'in_progress') in_progress += 1;
    else if (b === 'done') done += 1;
  }
  return { waiting, in_progress, done, total: items.length };
}

export function aggregateGroomingDayBoard(items: GroomingDayBoardItem[]): NonNullable<HubDayOpsSummary['grooming']> {
  const by_stage: Record<string, number> = {};
  let waiting = 0;
  let in_service = 0;
  let ready = 0;
  for (const item of items) {
    const stage = String(item.grooming_stage || 'scheduled');
    by_stage[stage] = (by_stage[stage] ?? 0) + 1;
    if (GROOMING_WAITING.has(stage)) waiting += 1;
    else if (GROOMING_IN_SERVICE.has(stage)) in_service += 1;
    else if (GROOMING_READY.has(stage)) ready += 1;
  }
  const active = items.filter((i) => !GROOMING_DONE.has(String(i.grooming_stage))).length;
  return { total: active || items.length, waiting, in_service, ready, by_stage };
}

export function aggregateBoarding(
  occupancy: BoardingOccupancyResponse,
  items: BoardingDayBoardItem[],
): NonNullable<HubDayOpsSummary['boarding']> {
  const checkins_today = items.filter((i) => {
    const stage = String(i.boarding_stage || '').toLowerCase();
    return stage === 'reserved' || stage === 'checked_in';
  }).length;
  return {
    hotel: {
      current: occupancy.hotel?.current ?? 0,
      max: occupancy.hotel?.max ?? null,
      over_capacity: Boolean(occupancy.hotel?.over_capacity),
    },
    daycare: {
      current: occupancy.daycare?.current ?? 0,
      max: occupancy.daycare?.max ?? null,
      over_capacity: Boolean(occupancy.daycare?.over_capacity),
    },
    checkins_today,
  };
}

export function aggregatePickup(
  routes: PickupRoute[],
  dayBoardItems: PickupDayBoardItem[],
): NonNullable<HubDayOpsSummary['pickup']> {
  const activeRoutes = routes.filter((r) => r.status !== 'cancelled');
  const stops_pending = dayBoardItems.filter((i) => {
    const st = String(i.stop_status || i.status || '').toLowerCase();
    return !st || st === 'pending' || st === 'en_route' || st === 'arrived' || st === 'in_transit' || st === 'confirmed';
  }).length;
  const routes_without_driver = activeRoutes.filter((r) => !r.driver_staff_id && !r.driver?.id).length;
  return {
    routes: activeRoutes.length,
    stops_pending,
    routes_without_driver,
  };
}
