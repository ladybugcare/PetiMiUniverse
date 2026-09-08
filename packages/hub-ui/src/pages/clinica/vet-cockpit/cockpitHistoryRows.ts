import type { HubEncounter, HubHospitalization, HubSurgery } from '../../../api/hubClinicalApi';
import { encounterTypeLabel } from '../clinic-records/clinicRecordsUtils';
import { HOSP_STATUS_LABEL } from '../hospital/hospDisplay';
import { SURGERY_STATUS_LABEL } from '../surgery/surgDisplay';

export type CockpitHistoryKind = 'encounter' | 'surgery' | 'hospitalization';
export type CockpitHistoryPeriod = 'today' | '7d' | '30d';

export type CockpitHistoryRow = {
  key: string;
  kind: CockpitHistoryKind;
  at: string;
  petName: string;
  petId: string | null;
  title: string;
  status: string;
  statusLabel: string;
  href: string;
  caseId: string | null;
};

export const HISTORY_KIND_LABEL: Record<CockpitHistoryKind, string> = {
  encounter: 'Atendimento',
  surgery: 'Cirurgia',
  hospitalization: 'Internação',
};

const FINISHED_SURGERY = new Set(['completed', 'cancelled']);
const FINISHED_HOSP = new Set(['discharged', 'death', 'transferred', 'cancelled']);

function periodStartMs(period: CockpitHistoryPeriod, now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === '7d') d.setDate(d.getDate() - 6);
  if (period === '30d') d.setDate(d.getDate() - 29);
  return d.getTime();
}

export function buildCockpitHistoryRows(input: {
  encounters: HubEncounter[];
  surgeries: HubSurgery[];
  hospitalizations: HubHospitalization[];
}): CockpitHistoryRow[] {
  const rows: CockpitHistoryRow[] = [];

  for (const e of input.encounters) {
    if (e.status !== 'completed' && e.status !== 'cancelled') continue;
    const at = e.completed_at || e.started_at;
    if (!at) continue;
    rows.push({
      key: `enc-${e.id}`,
      kind: 'encounter',
      at,
      petName: e.pet?.name || 'Sem pet',
      petId: e.pet_id,
      title: e.chief_complaint?.trim() || encounterTypeLabel(e.encounter_type),
      status: e.status,
      statusLabel: e.status === 'cancelled' ? 'Cancelado' : 'Finalizado',
      href: `/hub/clinica/atendimentos/${e.id}`,
      caseId: e.hub_case_id,
    });
  }

  for (const s of input.surgeries) {
    if (!FINISHED_SURGERY.has(s.status)) continue;
    const at = s.completed_at || s.started_at || s.scheduled_at;
    if (!at) continue;
    rows.push({
      key: `surg-${s.id}`,
      kind: 'surgery',
      at,
      petName: s.hub_pets?.name || 'Pet',
      petId: s.pet_id,
      title: s.title,
      status: s.status,
      statusLabel: SURGERY_STATUS_LABEL[s.status] || s.status,
      href: `/hub/clinica/cirurgias/${s.id}`,
      caseId: s.hub_case_id ?? null,
    });
  }

  for (const h of input.hospitalizations) {
    if (!FINISHED_HOSP.has(h.status)) continue;
    const at = h.discharged_at || h.admitted_at;
    if (!at) continue;
    rows.push({
      key: `hosp-${h.id}`,
      kind: 'hospitalization',
      at,
      petName: h.hub_pets?.name || 'Pet',
      petId: h.pet_id,
      title: h.reason?.trim() || 'Internação',
      status: h.status,
      statusLabel: HOSP_STATUS_LABEL[h.status] || h.status,
      href: `/hub/clinica/internacoes/${h.id}`,
      caseId: h.hub_case_id ?? null,
    });
  }

  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function filterCockpitHistoryRows(
  rows: CockpitHistoryRow[],
  opts: {
    kind: CockpitHistoryKind | 'all';
    query: string;
    period: CockpitHistoryPeriod;
    now?: Date;
  },
): CockpitHistoryRow[] {
  const q = opts.query.trim().toLowerCase();
  const from = periodStartMs(opts.period, opts.now);
  return rows.filter((row) => {
    if (opts.kind !== 'all' && row.kind !== opts.kind) return false;
    if (new Date(row.at).getTime() < from) return false;
    if (!q) return true;
    return (
      row.petName.toLowerCase().includes(q) ||
      row.title.toLowerCase().includes(q) ||
      row.statusLabel.toLowerCase().includes(q)
    );
  });
}
