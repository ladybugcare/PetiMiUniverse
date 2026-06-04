import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  coercePricingMatrixFromApi,
  computeReferenceFromMatrix,
  defaultPersonalizadoMatrix,
  defaultPricingMatrixForGroup,
  defaultPricingMatrixForKind,
  matrixKindForGroup,
  serviceTypeUsesPricingMatrix,
  supportsPricingMatrixGroup,
  type HubServicePricingMatrix,
} from '../../utils/hubServiceTypesPricingMatrix';
import { SERVICE_GROUP_OPTIONS, serviceGroupLabel } from '../../utils/serviceTypeSlug';

export const DESC_MAX = 300;

/** Limite alinhado ao backend (`hub_service_types.name`). */
export const SERVICE_NAME_MAX = 200;

/** Nome sugerido ao duplicar um serviço (respeita o limite de caracteres). */
export function suggestedDuplicateServiceName(original: string): string {
  const base = original.trim();
  const suffix = ' (cópia)';
  if (!base) return 'Novo serviço (cópia)'.slice(0, SERVICE_NAME_MAX);
  if (base.length + suffix.length <= SERVICE_NAME_MAX) return `${base}${suffix}`;
  const keep = SERVICE_NAME_MAX - suffix.length;
  return `${base.slice(0, Math.max(1, keep))}${suffix}`;
}

export type PricingCategoryKind =
  | 'simple'
  | 'porte'
  | 'pelagem'
  | 'porte_pelagem'
  | 'periodo'
  | 'consulta'
  | 'km_banda'
  | 'personalizado';

/** Unidade do campo «duração padrão» no formulário (API continua em minutos inteiros). */
export type DurationInputUnit = 'min' | 'h';

export type FormState = {
  name: string;
  service_group: string;
  pricing_mode: 'simple' | 'matrix';
  pricing_matrix: HubServicePricingMatrix | null;
  cost_amount: string;
  sale_amount: string;
  /** Valor mostrado no input, interpretado com `duration_input_unit`. */
  default_duration_minutes: string;
  duration_input_unit: DurationInputUnit;
  description: string;
  allow_scheduling: boolean;
  internal_notes: string;
  code_locked: boolean;
};

export const SERVICE_GROUP_HINTS: Record<string, string> = {
  banho_tosa:
    'Pode usar uma única linha de serviço com preços diferentes por porte, por pelagem ou pela combinação porte + pelagem.',
  hotel: 'Mesmo modelo por porte: um serviço «hotel» com tabela por tamanho do animal.',
  creche: 'Defina valores para dia completo e meio dia no mesmo serviço, quando activar a tabela de preços.',
  clinica: 'Consulta padrão e retorno no mesmo registo; retorno pode ter venda 0 (gratuita).',
  cirurgia: 'Precificação única (custo e venda) por serviço, salvo extensões futuras.',
  leva_traz: 'Adicione faixas de quilometragem com nome e valores; pode haver várias linhas no mesmo serviço.',
  internacao: 'Hospitalização ou internamento: preço único por serviço ou pacotes por dia.',
  outros: 'Serviços gerais: preço único por linha.',
};

export const CUSTOM_GROUP_HINT =
  'Grupo personalizado: precificação única. Pode personalizar nome, cor e ordem em Configurações → Grupos de serviços.';

export function formatMoneyNumberBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function formatMoneyCurrencyBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function parseMoneyInput(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/R\$\s*/gi, '')
    .trim()
    .replace(/\s/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function marginOverSalePct(cost: number, sale: number): number | null {
  if (!(sale > 0)) return null;
  return ((sale - cost) / sale) * 100;
}

/** Aceita «1,5» ou «1.5»; devolve null se vazio ou inválido. */
export function parsePositiveDecimal(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Converte o valor do formulário para minutos inteiros (≥ 1) ou null. */
export function parseDurationInputToMinutes(raw: string, unit: DurationInputUnit): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = parsePositiveDecimal(s);
  if (n == null) return null;
  if (unit === 'min') {
    const m = Math.round(n);
    return m >= 1 ? m : null;
  }
  const m = Math.round(n * 60);
  return m >= 1 ? m : null;
}

/** Ao mudar min ↔ h, recalcula o texto do input mantendo a mesma duração em minutos quando possível. */
export function changeDurationUnit(prev: FormState, newUnit: DurationInputUnit): FormState {
  if (prev.duration_input_unit === newUnit) return prev;
  const mins = parseDurationInputToMinutes(prev.default_duration_minutes, prev.duration_input_unit);
  if (mins == null) {
    return { ...prev, duration_input_unit: newUnit };
  }
  if (newUnit === 'h') {
    const h = mins / 60;
    const rounded = Math.round(h * 100) / 100;
    const display = Number.isInteger(rounded) ? String(rounded) : String(rounded);
    return { ...prev, duration_input_unit: 'h', default_duration_minutes: display };
  }
  return { ...prev, duration_input_unit: 'min', default_duration_minutes: String(mins) };
}

export function emptyForm(): FormState {
  return {
    name: '',
    service_group: 'outros',
    pricing_mode: 'simple',
    pricing_matrix: null,
    cost_amount: '',
    sale_amount: '',
    default_duration_minutes: '',
    duration_input_unit: 'min',
    description: '',
    allow_scheduling: true,
    internal_notes: '',
    code_locked: false,
  };
}

export function fromRow(t: HubServiceType): FormState {
  const cost = Number(t.cost_amount ?? 0);
  const sale = Number(t.sale_amount ?? 0);
  const group = t.service_group || 'outros';
  const pm = coercePricingMatrixFromApi(t.pricing_matrix);
  const useMatrix = serviceTypeUsesPricingMatrix(group, pm);
  const pricing_mode: FormState['pricing_mode'] = useMatrix ? 'matrix' : 'simple';
  const pricing_matrix: HubServicePricingMatrix | null = useMatrix && pm ? pm : null;
  const ref = useMatrix && pm ? computeReferenceFromMatrix(pm) : { cost, sale };
  const dmRaw = t.default_duration_minutes;
  const dm = dmRaw != null && Number.isFinite(Number(dmRaw)) ? Math.max(0, Math.floor(Number(dmRaw))) : null;
  let durationStr = '';
  let durationUnit: DurationInputUnit = 'min';
  if (dm != null && dm > 0) {
    if (dm % 60 === 0) {
      durationStr = String(dm / 60);
      durationUnit = 'h';
    } else {
      durationStr = String(dm);
      durationUnit = 'min';
    }
  }
  return {
    name: t.name,
    service_group: group,
    pricing_mode,
    pricing_matrix,
    cost_amount: formatMoneyNumberBrl(Number.isFinite(ref.cost) ? ref.cost : 0),
    sale_amount: formatMoneyNumberBrl(Number.isFinite(ref.sale) ? ref.sale : 0),
    default_duration_minutes: durationStr,
    duration_input_unit: durationUnit,
    description: t.description ?? '',
    allow_scheduling: t.allow_scheduling !== false,
    internal_notes: t.internal_notes ?? '',
    code_locked: Boolean(t.code_locked),
  };
}

export function applySvcGroupChange(prev: FormState, newGroup: string): FormState {
  const seedCost = parseMoneyInput(prev.cost_amount) ?? 0;
  const seedSale = parseMoneyInput(prev.sale_amount) ?? 0;
  const prevMatrix = prev.pricing_matrix;
  const prevKind = prevMatrix?.kind ?? null;
  const nextKind = matrixKindForGroup(newGroup);

  let pricing_mode: FormState['pricing_mode'] = prev.pricing_mode;
  let pricing_matrix: HubServicePricingMatrix | null = prev.pricing_matrix;

  if (prevKind === 'personalizado' && prevMatrix) {
    pricing_mode = 'matrix';
    pricing_matrix = prevMatrix;
  } else if (!supportsPricingMatrixGroup(newGroup)) {
    pricing_mode = 'simple';
    pricing_matrix = null;
  } else if (prev.pricing_mode === 'simple' && !prevMatrix) {
    pricing_mode = 'simple';
    pricing_matrix = null;
  } else if (prevMatrix != null && prevKind === nextKind && nextKind != null) {
    pricing_mode = prev.pricing_mode;
    pricing_matrix = prevMatrix;
  } else {
    const d = defaultPricingMatrixForGroup(newGroup, { cost_amount: seedCost, sale_amount: seedSale });
    pricing_mode = d ? 'matrix' : 'simple';
    pricing_matrix = d;
  }

  if (pricing_mode === 'matrix' && pricing_matrix) {
    const ref = computeReferenceFromMatrix(pricing_matrix);
    return {
      ...prev,
      service_group: newGroup,
      pricing_mode,
      pricing_matrix,
      cost_amount: formatMoneyNumberBrl(ref.cost),
      sale_amount: formatMoneyNumberBrl(ref.sale),
    };
  }

  return { ...prev, service_group: newGroup, pricing_mode, pricing_matrix };
}

export function groupComboOptionsFromGroups(
  groups: Array<{ slug: string; name: string; archived_at?: string | null }>
): HubComboboxOption[] {
  const seen = new Set<string>();
  for (const g of groups) {
    if (g.slug) seen.add(g.slug);
  }
  const fromApi = groups
    .filter((g) => g.slug && !g.archived_at)
    .map((g) => ({ value: g.slug, label: g.name || serviceGroupLabel(g.slug) }));
  const missingDefaults = SERVICE_GROUP_OPTIONS.filter((o) => !seen.has(o.value)).map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const defaultOrder = SERVICE_GROUP_OPTIONS.map((o) => o.value);
  return [...fromApi, ...missingDefaults].sort((a, b) => {
    const ai = defaultOrder.indexOf(a.value as (typeof defaultOrder)[number]);
    const bi = defaultOrder.indexOf(b.value as (typeof defaultOrder)[number]);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.label.localeCompare(b.label, 'pt');
  });
}

const PERSONALIZADO_OPTION = { kind: 'personalizado' as const, label: 'Personalizado' };

/** Adicionais: apenas preço único ou personalizado. */
export function pricingCategoryOptionsForAddon(): Array<{ kind: PricingCategoryKind; label: string }> {
  return [
    { kind: 'simple', label: 'Preço único' },
    PERSONALIZADO_OPTION,
  ];
}

export function pricingCategoryOptionsForGroup(serviceGroup: string): Array<{ kind: PricingCategoryKind; label: string }> {
  const withPersonalizado = (opts: Array<{ kind: PricingCategoryKind; label: string }>) => [...opts, PERSONALIZADO_OPTION];
  if (serviceGroup === 'banho_tosa') {
    return withPersonalizado([
      { kind: 'simple', label: 'Preço único' },
      { kind: 'porte', label: 'Por porte' },
      { kind: 'pelagem', label: 'Por pelagem' },
      { kind: 'porte_pelagem', label: 'Por porte + pelagem' },
    ]);
  }
  if (serviceGroup === 'hotel') return withPersonalizado([{ kind: 'simple', label: 'Preço único' }, { kind: 'porte', label: 'Por porte' }]);
  if (serviceGroup === 'creche') return withPersonalizado([{ kind: 'simple', label: 'Preço único' }, { kind: 'periodo', label: 'Por período' }]);
  if (serviceGroup === 'clinica') return withPersonalizado([{ kind: 'simple', label: 'Preço único' }, { kind: 'consulta', label: 'Por tipo de consulta' }]);
  if (serviceGroup === 'leva_traz') return withPersonalizado([{ kind: 'simple', label: 'Preço único' }, { kind: 'km_banda', label: 'Por faixa de km' }]);
  return withPersonalizado([{ kind: 'simple', label: 'Preço único' }]);
}

export function setPricingCategory(prev: FormState, kind: PricingCategoryKind): FormState {
  if (kind === 'simple') return { ...prev, pricing_mode: 'simple', pricing_matrix: null };
  const seedC = parseMoneyInput(prev.cost_amount) ?? 0;
  const seedS = parseMoneyInput(prev.sale_amount) ?? 0;
  const next =
    kind === 'personalizado'
      ? defaultPersonalizadoMatrix({ cost_amount: seedC, sale_amount: seedS })
      : kind === 'porte' || kind === 'pelagem' || kind === 'porte_pelagem'
        ? defaultPricingMatrixForKind(kind, { cost_amount: seedC, sale_amount: seedS })
        : defaultPricingMatrixForGroup(prev.service_group, { cost_amount: seedC, sale_amount: seedS });
  if (!next) return { ...prev, pricing_mode: 'simple', pricing_matrix: null };
  const ref = computeReferenceFromMatrix(next);
  return {
    ...prev,
    pricing_mode: 'matrix',
    pricing_matrix: next,
    cost_amount: formatMoneyNumberBrl(ref.cost),
    sale_amount: formatMoneyNumberBrl(ref.sale),
  };
}
