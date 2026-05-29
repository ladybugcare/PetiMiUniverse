export const AGENDA_FILTERS_STORAGE_KEY = 'petmi-hub-agenda-filters-v1';

export type AgendaPersistedFilters = {
  unit: string;
  professional: string;
  group: string;
  status: string;
  groupMode: string;
  resource_label: string;
  service_type_id: string;
};

export function loadAgendaPersistedFilters(): Partial<AgendaPersistedFilters> {
  try {
    const raw = sessionStorage.getItem(AGENDA_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AgendaPersistedFilters>;
  } catch {
    return {};
  }
}

export function saveAgendaPersistedUnit(unit: string) {
  try {
    const prev = loadAgendaPersistedFilters();
    sessionStorage.setItem(
      AGENDA_FILTERS_STORAGE_KEY,
      JSON.stringify({ ...prev, unit }),
    );
  } catch {
    /* ignore */
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Intervalo do dia civil local (mesma lógica da Agenda em vista «dia»). */
export function dayRangeIsoLocal(cursor: Date): { from: string; to: string; dateYmd: string } {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const d = cursor.getDate();
  const from = new Date(y, m, d, 0, 0, 0, 0);
  const to = new Date(y, m, d, 23, 59, 59, 999);
  const dateYmd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { from: from.toISOString(), to: to.toISOString(), dateYmd };
}
