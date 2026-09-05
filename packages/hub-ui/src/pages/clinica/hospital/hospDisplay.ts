import type { HubHospitalizationEvent, HubHospitalizationEventKind } from '../../../api/hubClinicalApi';

export const HOSP_STATUS_LABEL: Record<string, string> = {
  active: 'Internado',
  discharged: 'Alta',
  death: 'Óbito',
  transferred: 'Transferido',
  cancelled: 'Cancelado',
};

export const BED_STATUS_LABEL: Record<string, string> = {
  available: 'Livre',
  occupied: 'Ocupado',
  maintenance: 'Manutenção',
};

export const EVENT_KIND_LABEL: Record<HubHospitalizationEventKind, string> = {
  vital: 'Sinais vitais',
  medication: 'Medicação',
  feeding: 'Alimentação',
  fluid: 'Fluidoterapia',
  nursing: 'Enfermagem',
  note: 'Nota',
};

export type HospAdmitReasonChip = { key: string; label: string };

/** Motivos frequentes de internação — o valor persistido é o rótulo (ou rótulo + complemento). */
export const HOSP_ADMIT_REASON_OPTIONS: HospAdmitReasonChip[] = [
  { key: 'emergencia', label: 'Emergência' },
  { key: 'pos_cirurgico', label: 'Pós-cirúrgico' },
  { key: 'fluidoterapia', label: 'Fluidoterapia' },
  { key: 'observacao', label: 'Observação' },
  { key: 'desidratacao', label: 'Desidratação' },
  { key: 'trauma', label: 'Trauma' },
  { key: 'neuro', label: 'Convulsão / neurológico' },
  { key: 'dispneia', label: 'Dispneia' },
  { key: 'gastro', label: 'Gastroenterite' },
  { key: 'renal', label: 'Renal' },
];

export function hospAdmitReasonLabel(key: string): string {
  return HOSP_ADMIT_REASON_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export function buildHospAdmitReason(chipKey: string, detail: string): string {
  const label = chipKey ? hospAdmitReasonLabel(chipKey) : '';
  const extra = detail.trim();
  if (label && extra) return `${label} — ${extra}`;
  return extra || label;
}

export const EVENT_KIND_ORDER: HubHospitalizationEventKind[] = [
  'vital',
  'medication',
  'feeding',
  'fluid',
  'nursing',
  'note',
];

export function formatHospDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('pt-BR');
}

export function formatHospDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export type HospEventFact = { label: string; value: string };

const FIELD_LABELS: Record<string, string> = {
  weight_kg: 'Peso (kg)',
  temperature_c: 'Temperatura (°C)',
  heart_rate: 'FC (bpm)',
  respiratory_rate: 'FR (rpm)',
  lymph_nodes: 'Linfonodos',
  general_state: 'Estado geral',
  pain: 'Dor',
  spo2: 'SpO₂ (%)',
  blood_pressure: 'Pressão',
  medication_name: 'Medicamento',
  dosage: 'Dose',
  route: 'Via',
  food_type: 'Alimento',
  food_types: 'Alimento',
  amount_g: 'Quantidade (g)',
  accepted: 'Aceitação',
  fluid_type: 'Fluido',
  rate_ml_h: 'Taxa (ml/h)',
  volume_ml: 'Volume (ml)',
  procedure: 'Procedimento',
  procedures: 'Procedimento',
  presentation: 'Apresentação',
  crt: 'TPC',
  hydration: 'Hidratação',
  mucosa: 'Mucosas',
  text: 'Nota',
  title: 'Título',
  note: 'Observação',
  notes: 'Observação',
};

const VALUE_LABELS: Record<string, string> = {
  yes: 'Aceitou',
  partial: 'Parcial',
  no: 'Recusou',
  lt2: '< 2 s',
  eq2: '2 s',
  gt2: '> 2 s',
  normal: 'Normal',
  leve: 'Desidratação leve',
  moderada: 'Moderada',
  grave: 'Grave',
  rosada: 'Rosada',
  palida: 'Pálida',
  congestionada: 'Congesta',
  cianotica: 'Cianótica',
  icterica: 'Ictérica',
  racao_seca: 'Ração seca',
  racao_umida: 'Ração úmida',
  racao_prescrita: 'Ração prescrita',
  dieta_caseira: 'Dieta caseira',
  dieta_natural: 'Natural / BARF',
  petiscos: 'Petiscos',
  inapetente: 'Inapetente',
  jejum: 'Em jejum',
  nacl_09: 'NaCl 0,9%',
  ringer_lactato: 'Ringer lactato',
  ringer: 'Ringer simples',
  glicose_5: 'Glicose 5%',
  coloide: 'Colóide',
  normais: 'Normais',
  aumentados: 'Aumentados',
  dolorosos: 'Dolorosos',
  alerta: 'Alerta',
  apatico: 'Apático',
  deprimido: 'Deprimido',
  prostrado: 'Prostrado',
  none: 'Sem sinais',
  mild: 'Leve',
  moderate: 'Moderada',
  severe: 'Intensa',
  curativo: 'Curativo',
  sonda: 'Sonda',
  fisioterapia: 'Fisioterapia',
  higiene: 'Higiene',
  monitoramento: 'Monitoramento',
  troca_via: 'Troca de via',
  posicionamento: 'Posicionamento',
};

function prettyValue(key: string, value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    const parts = value.map((v) => VALUE_LABELS[String(v)] ?? String(v)).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof value === 'string' && VALUE_LABELS[value]) return VALUE_LABELS[value];
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export type HospChipTone = 'info' | 'warning' | 'danger';
export type HospEventChip = { key: string; label: string; tone?: HospChipTone };
export type HospEventMetric = { key: string; label: string; value: string; unit?: string };
export type HospEventView = {
  kind: HubHospitalizationEventKind;
  kindLabel: string;
  title: string | null;
  summary: string | null;
  metrics: HospEventMetric[];
  chips: HospEventChip[];
  note: string | null;
};

const VITAL_METRICS: Array<{ key: string; label: string; unit?: string }> = [
  { key: 'temperature_c', label: 'Temp.', unit: '°C' },
  { key: 'heart_rate', label: 'FC', unit: 'bpm' },
  { key: 'respiratory_rate', label: 'FR', unit: 'rpm' },
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'blood_pressure', label: 'PA' },
];

const ASSESS_KEYS = ['crt', 'hydration', 'mucosa', 'lymph_nodes', 'general_state', 'pain'] as const;

const CHIP_TONES: Record<string, HospChipTone> = {
  gt2: 'danger',
  eq2: 'warning',
  lt2: 'info',
  leve: 'warning',
  moderada: 'warning',
  grave: 'danger',
  palida: 'warning',
  congestionada: 'warning',
  cianotica: 'danger',
  icterica: 'warning',
  aumentados: 'warning',
  dolorosos: 'warning',
  apatico: 'warning',
  deprimido: 'warning',
  prostrado: 'danger',
  mild: 'info',
  moderate: 'warning',
  severe: 'danger',
  partial: 'warning',
  no: 'danger',
  yes: 'info',
  inapetente: 'warning',
  jejum: 'warning',
};

function joinSummary(parts: Array<string | null | undefined>): string | null {
  const next = parts.map((p) => (p == null ? '' : String(p).trim())).filter(Boolean);
  return next.length ? next.join(' · ') : null;
}

function chipFor(key: string, raw: unknown, prefix?: string): HospEventChip | null {
  const value = prettyValue(key, raw);
  if (!value) return null;
  const toneKey = Array.isArray(raw) ? '' : String(raw);
  return {
    key,
    label: prefix ? `${prefix} · ${value}` : value,
    tone: CHIP_TONES[toneKey] ?? 'info',
  };
}

export function hospEventView(ev: HubHospitalizationEvent): HospEventView {
  const payload = ev.payload ?? {};
  const { facts, note } = hospEventFacts(ev);
  const byKey = (key: string) => prettyValue(key, payload[key]);

  const base: HospEventView = {
    kind: ev.kind,
    kindLabel: EVENT_KIND_LABEL[ev.kind] ?? ev.kind,
    title: null,
    summary: null,
    metrics: [],
    chips: [],
    note,
  };

  if (ev.kind === 'vital') {
    base.metrics = VITAL_METRICS.flatMap(({ key, label, unit }) => {
      const value = byKey(key);
      return value ? [{ key, label, value, unit }] : [];
    });
    base.chips = ASSESS_KEYS.flatMap((key) => {
      const prefix = key === 'crt' ? 'TPC' : key === 'pain' ? 'Dor' : undefined;
      const chip = chipFor(key, payload[key], prefix);
      return chip ? [chip] : [];
    });
    return base;
  }

  if (ev.kind === 'medication') {
    base.title = byKey('medication_name');
    base.summary = joinSummary([byKey('presentation'), byKey('route'), byKey('dosage')]);
    return base;
  }

  if (ev.kind === 'feeding') {
    const foods = prettyValue('food_types', payload.food_types) ?? byKey('food_type');
    base.title = foods;
    base.summary = byKey('amount_g') ? `${byKey('amount_g')} g` : null;
    const accepted = chipFor('accepted', payload.accepted);
    if (accepted) base.chips = [accepted];
    return base;
  }

  if (ev.kind === 'fluid') {
    base.title = byKey('fluid_type');
    base.summary = joinSummary([
      byKey('volume_ml') ? `${byKey('volume_ml')} ml` : null,
      byKey('rate_ml_h') ? `${byKey('rate_ml_h')} ml/h` : null,
    ]);
    return base;
  }

  if (ev.kind === 'nursing') {
    const procedures = Array.isArray(payload.procedures) ? payload.procedures : [];
    if (procedures.length) {
      base.chips = procedures.flatMap((raw, i) => {
        const chip = chipFor('procedures', raw);
        return chip ? [{ ...chip, key: `${chip.key}-${i}` }] : [];
      });
    } else if (byKey('procedure')) {
      base.title = byKey('procedure');
    }
    return base;
  }

  if (ev.kind === 'note') {
    base.title = byKey('title');
    return base;
  }

  base.summary = facts.map((f) => `${f.label} ${f.value}`).join(' · ') || null;
  return base;
}

export function hospEventFacts(ev: HubHospitalizationEvent): { facts: HospEventFact[]; note: string | null } {
  const payload = ev.payload ?? {};
  const noteRaw = payload.note ?? payload.notes ?? (ev.kind === 'note' ? payload.text : null);
  const note = noteRaw == null || noteRaw === '' ? null : String(noteRaw);
  const skip = new Set([
    'note',
    'notes',
    ...(ev.kind === 'note' ? ['text'] : []),
    ...(payload.food_type != null ? ['food_types'] : []),
    ...(payload.procedure != null ? ['procedures'] : []),
  ]);
  const facts: HospEventFact[] = [];
  for (const [key, raw] of Object.entries(payload)) {
    if (skip.has(key)) continue;
    const value = prettyValue(key, raw);
    if (!value) continue;
    facts.push({ label: FIELD_LABELS[key] ?? key, value });
  }
  return { facts, note };
}

export function petInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hospEventHasContent(payload: Record<string, unknown>): boolean {
  return Object.values(payload).some((v) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== '';
  });
}
