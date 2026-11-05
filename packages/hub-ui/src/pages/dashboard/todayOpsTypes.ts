/** Contrato compartilhado front ↔ `GET /api/hub/day-ops-summary`. */

export type HubDayOpsOccupancySlot = {
  current: number;
  max: number | null;
  over_capacity: boolean;
};

export type HubDayOpsSummary = {
  date: string;
  agenda?: {
    total: number;
    by_group: Array<{ key: string; label: string; count: number }>;
  };
  clinic?: {
    waiting: number;
    in_progress: number;
    done: number;
    total: number;
  };
  grooming?: {
    total: number;
    waiting: number;
    in_service: number;
    ready: number;
    by_stage: Record<string, number>;
  };
  boarding?: {
    hotel: HubDayOpsOccupancySlot;
    daycare: HubDayOpsOccupancySlot;
    checkins_today: number;
  };
  pickup?: {
    routes: number;
    stops_pending: number;
    routes_without_driver: number;
  };
  finance?: {
    received_today: number;
    outstanding: number;
    cash_open: boolean;
    cash_opened_at: string | null;
    pending_billing: number;
  };
  alerts?: {
    low_stock: number;
    vaccines_due: number;
    overdue_receivables_count: number;
    overdue_receivables_total: number;
    overdue_payables_count?: number;
    overdue_payables_total?: number;
    due_today_payables_count?: number;
    due_today_payables_total?: number;
  };
};
