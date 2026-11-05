import { hubAppointmentsApi } from '../../api/hubAppointmentsApi';
import { hubEncountersApi } from '../../api/hubClinicalApi';
import { hubGroomingApi } from '../../api/hubGroomingApi';
import { hubBoardingApi } from '../../api/hubBoardingApi';
import { hubPickupApi } from '../../api/hubPickupApi';
import { hubFinancialApi } from '../../api/hubFinancialApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import {
  aggregateAgendaStats,
  aggregateBoarding,
  aggregateClinicDayBoard,
  aggregateGroomingDayBoard,
  aggregatePickup,
} from './todayOpsAggregate';
import { daysUntilDue } from '../finance/dueDateTone';
import type { HubDayOpsSummary } from './todayOpsTypes';

export type DayOpsPermFlags = {
  appointments: boolean;
  clinic: boolean;
  grooming: boolean;
  boarding: boolean;
  pickup: boolean;
  financial: boolean;
  inventory: boolean;
};

/**
 * Fallback MVP: agrega day-boards existentes no cliente.
 * Preferir `hubOpsApi.getDayOpsSummary` quando o backend estiver disponível.
 */
export async function loadDayOpsSummaryClient(
  clinicId: string,
  unitId: string,
  perms: DayOpsPermFlags,
  cursor = new Date(),
): Promise<HubDayOpsSummary> {
  const dayRange = dayRangeIsoLocal(cursor);
  const summary: HubDayOpsSummary = { date: dayRange.dateYmd };

  const tasks: Array<Promise<void>> = [];

  if (perms.appointments) {
    tasks.push(
      hubAppointmentsApi
        .getStatsByServiceGroup({
          clinic_id: clinicId,
          unit_id: unitId,
          from: dayRange.dateYmd,
          to: dayRange.dateYmd,
        })
        .then((r) => {
          summary.agenda = aggregateAgendaStats(r.items ?? []);
        })
        .catch(() => undefined),
    );
  }

  if (perms.clinic) {
    tasks.push(
      hubEncountersApi
        .dayBoard(clinicId, dayRange, { unitId })
        .then((r) => {
          summary.clinic = aggregateClinicDayBoard(r.items ?? []);
        })
        .catch(() => undefined),
    );
  }

  if (perms.grooming) {
    tasks.push(
      hubGroomingApi
        .dayBoard(clinicId, dayRange, { unitId })
        .then((r) => {
          summary.grooming = aggregateGroomingDayBoard(r.items ?? []);
        })
        .catch(() => undefined),
    );
  }

  if (perms.boarding) {
    tasks.push(
      Promise.all([
        hubBoardingApi.getOccupancy(clinicId, { unitId, dateYmd: dayRange.dateYmd }),
        hubBoardingApi.dayBoard(clinicId, dayRange, { unitId }),
      ])
        .then(([occ, board]) => {
          summary.boarding = aggregateBoarding(occ, board.items ?? []);
        })
        .catch(() => undefined),
    );
  }

  if (perms.pickup) {
    tasks.push(
      Promise.all([
        hubPickupApi.listRoutes(clinicId, { date: dayRange.dateYmd, unitId }),
        hubPickupApi.dayBoard(clinicId, dayRange, { unitId }),
      ])
        .then(([routesRes, board]) => {
          summary.pickup = aggregatePickup(routesRes.routes ?? [], board.items ?? []);
        })
        .catch(() => undefined),
    );
  }

  if (perms.financial) {
    tasks.push(
      Promise.all([
        hubFinancialApi.getDashboardSummary(clinicId, unitId, {
          from: dayRange.dateYmd,
          to: dayRange.dateYmd,
        }),
        hubFinancialApi.getCashSessionStatus(clinicId, unitId),
        hubFinancialApi.getAgingReport(clinicId, unitId),
        hubFinancialApi.listPayables(clinicId, unitId, { status: 'pending' }).catch(() => []),
      ])
        .then(([dash, cash, aging, pendingPayables]) => {
          const buckets = aging?.buckets;
          let overdueCount = 0;
          let overdueTotal = 0;
          if (buckets) {
            for (const k of ['overdue_1_30', 'overdue_31_60', 'overdue_61_plus'] as const) {
              overdueCount += buckets[k]?.count ?? 0;
              overdueTotal += buckets[k]?.total ?? 0;
            }
          }
          let overduePayablesCount = 0;
          let overduePayablesTotal = 0;
          let dueTodayPayablesCount = 0;
          let dueTodayPayablesTotal = 0;
          for (const row of pendingPayables) {
            const days = daysUntilDue(row.due_date);
            if (days == null) continue;
            const amt = Number(row.amount ?? 0);
            if (days < 0) {
              overduePayablesCount += 1;
              overduePayablesTotal += amt;
            } else if (days === 0) {
              dueTodayPayablesCount += 1;
              dueTodayPayablesTotal += amt;
            }
          }
          summary.finance = {
            received_today: dash.payments_total_period ?? 0,
            outstanding: dash.receivables_outstanding ?? 0,
            cash_open: cash.cash_session?.status === 'open',
            cash_opened_at: cash.cash_session?.opened_at ?? null,
            pending_billing: cash.pending_billing_count ?? dash.pending_billing_count ?? 0,
          };
          summary.alerts = {
            ...(summary.alerts ?? { low_stock: 0, vaccines_due: 0, overdue_receivables_count: 0, overdue_receivables_total: 0 }),
            overdue_receivables_count: overdueCount,
            overdue_receivables_total: overdueTotal,
            overdue_payables_count: overduePayablesCount,
            overdue_payables_total: overduePayablesTotal,
            due_today_payables_count: dueTodayPayablesCount,
            due_today_payables_total: dueTodayPayablesTotal,
          };
        })
        .catch(() => undefined),
    );
  }

  if (perms.clinic) {
    tasks.push(
      hubClinicalApi
        .alerts(clinicId)
        .then((r) => {
          summary.alerts = {
            low_stock: summary.alerts?.low_stock ?? 0,
            vaccines_due: (r.alerts ?? []).length,
            overdue_receivables_count: summary.alerts?.overdue_receivables_count ?? 0,
            overdue_receivables_total: summary.alerts?.overdue_receivables_total ?? 0,
            overdue_payables_count: summary.alerts?.overdue_payables_count ?? 0,
            overdue_payables_total: summary.alerts?.overdue_payables_total ?? 0,
            due_today_payables_count: summary.alerts?.due_today_payables_count ?? 0,
            due_today_payables_total: summary.alerts?.due_today_payables_total ?? 0,
          };
        })
        .catch(() => undefined),
    );
  }

  if (perms.inventory) {
    tasks.push(
      hubInventoryApi.reports
        .lowStock(clinicId)
        .then((r) => {
          summary.alerts = {
            low_stock: (r.items ?? []).length,
            vaccines_due: summary.alerts?.vaccines_due ?? 0,
            overdue_receivables_count: summary.alerts?.overdue_receivables_count ?? 0,
            overdue_receivables_total: summary.alerts?.overdue_receivables_total ?? 0,
            overdue_payables_count: summary.alerts?.overdue_payables_count ?? 0,
            overdue_payables_total: summary.alerts?.overdue_payables_total ?? 0,
            due_today_payables_count: summary.alerts?.due_today_payables_count ?? 0,
            due_today_payables_total: summary.alerts?.due_today_payables_total ?? 0,
          };
        })
        .catch(() => undefined),
    );
  }

  await Promise.allSettled(tasks);
  return summary;
}
