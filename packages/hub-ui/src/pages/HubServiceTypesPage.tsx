import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { hubServiceTypesApi, type HubServiceType } from '../api/hubServiceTypesApi';
import { hubServiceGroupsApi, type HubServiceGroupRow } from '../api/hubServiceGroupsApi';
import { useAlert } from '../components/AlertProvider';
import { HubSearchableCombobox } from '../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../components/HubSearchableCombobox';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import {
  Archive,
  CalendarCheck2,
  CalendarX2,
  Copy,
  Layers,
  LayoutGrid,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Timer,
} from 'lucide-react';
import { ServiceGroupIcon } from '../components/ServiceGroupIcon';
import { HubCheckbox } from '../components/HubCheckbox';
import { HubCancelButton } from '../components/HubCancelButton';
import { ServicePricingMatrixEditor } from '../components/ServicePricingMatrixEditor';
import {
  KNOWN_SERVICE_GROUP_SLUGS,
  SERVICE_GROUP_OPTIONS,
  hexToSoftFill,
  normalizeServiceGroupInput,
  resolveServiceAccentColor,
  serviceGroupLabel,
  slugifyServiceNameToCode,
} from '../utils/serviceTypeSlug';
import {
  coercePricingMatrixFromApi,
  computeReferenceFromMatrix,
  defaultPricingMatrixForGroup,
  defaultPricingMatrixForKind,
  matrixKindForGroup,
  saleRangeSummary,
  supportsPricingMatrixGroup,
  validatePricingMatrixClient,
  type HubServicePricingMatrix,
} from '../utils/hubServiceTypesPricingMatrix';
import './clientes/clientes.css';
import './pets/pets-page.css';
import './servicos/servicos-page.css';

/** Número só, estilo pt-BR (ex.: 1.234,56) — para campos editáveis. */
function formatMoneyNumberBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/** Valor com símbolo R$ (Real brasileiro). */
function formatMoneyCurrencyBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

/** Aceita `12,50`, `R$ 12,50`, `12.50` ou milhares pt-BR / EN (último separador decimal prevalece). */
function parseMoneyInput(raw: string): number | null {
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

function moneyCell(n: number): string {
  return formatMoneyCurrencyBrl(n);
}

function pricingCategoryLabel(kind: HubServicePricingMatrix['kind']): string {
  if (kind === 'porte') return 'Por porte';
  if (kind === 'pelagem') return 'Por pelagem';
  if (kind === 'porte_pelagem') return 'Por porte + pelagem';
  if (kind === 'periodo') return 'Por período';
  if (kind === 'consulta') return 'Por tipo de consulta';
  if (kind === 'km_banda') return 'Por faixa de km';
  return 'Por categorias';
}

/** Margem sobre o preço de venda (informativa): (venda − custo) / venda × 100 */
function marginOverSalePct(cost: number, sale: number): number | null {
  if (!(sale > 0)) return null;
  return ((sale - cost) / sale) * 100;
}

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

const SERVICE_GROUP_HINTS: Record<string, string> = {
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

const CUSTOM_GROUP_HINT =
  'Grupo personalizado: precificação única (sem tabela por porte, período ou km). O nome é guardado como identificador interno (slug). Pode reutilizar este grupo noutros serviços.';

const DESC_MAX = 300;

function truncateDesc(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

type PanelMode = 'none' | 'create' | 'edit';

type FormState = {
  name: string;
  service_group: string;
  pricing_mode: 'simple' | 'matrix';
  pricing_matrix: HubServicePricingMatrix | null;
  cost_amount: string;
  sale_amount: string;
  default_duration_minutes: string;
  description: string;
  allow_scheduling: boolean;
  internal_notes: string;
  code_locked: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  service_group: 'outros',
  pricing_mode: 'simple',
  pricing_matrix: null,
  cost_amount: '',
  sale_amount: '',
  default_duration_minutes: '',
  description: '',
  allow_scheduling: true,
  internal_notes: '',
  code_locked: false,
});

const fromRow = (t: HubServiceType): FormState => {
  const cost = Number(t.cost_amount ?? 0);
  const sale = Number(t.sale_amount ?? 0);
  const group = t.service_group || 'outros';
  const pm = coercePricingMatrixFromApi(t.pricing_matrix);
  const useMatrix = pm != null && supportsPricingMatrixGroup(group);
  const pricing_mode: FormState['pricing_mode'] = useMatrix ? 'matrix' : 'simple';
  const pricing_matrix: HubServicePricingMatrix | null = useMatrix && pm ? pm : null;
  const ref = useMatrix && pm ? computeReferenceFromMatrix(pm) : { cost, sale };
  return {
    name: t.name,
    service_group: group,
    pricing_mode,
    pricing_matrix,
    cost_amount: formatMoneyNumberBrl(Number.isFinite(ref.cost) ? ref.cost : 0),
    sale_amount: formatMoneyNumberBrl(Number.isFinite(ref.sale) ? ref.sale : 0),
    default_duration_minutes: t.default_duration_minutes != null ? String(t.default_duration_minutes) : '',
    description: t.description ?? '',
    allow_scheduling: t.allow_scheduling !== false,
    internal_notes: t.internal_notes ?? '',
    code_locked: Boolean(t.code_locked),
  };
};

function applySvcGroupChange(prev: FormState, newGroup: string): FormState {
  const seedCost = parseMoneyInput(prev.cost_amount) ?? 0;
  const seedSale = parseMoneyInput(prev.sale_amount) ?? 0;
  const prevMatrix = prev.pricing_matrix;
  const prevKind = prevMatrix?.kind ?? null;
  const nextKind = matrixKindForGroup(newGroup);

  let pricing_mode: FormState['pricing_mode'] = prev.pricing_mode;
  let pricing_matrix: HubServicePricingMatrix | null = prev.pricing_matrix;

  const enteringMatrixGroupFromNon =
    !supportsPricingMatrixGroup(prev.service_group) && supportsPricingMatrixGroup(newGroup);

  if (!supportsPricingMatrixGroup(newGroup)) {
    pricing_mode = 'simple';
    pricing_matrix = null;
  } else if (prev.pricing_mode === 'simple' && !prevMatrix && !enteringMatrixGroupFromNon) {
    pricing_mode = 'simple';
    pricing_matrix = null;
  } else {
    const hotelBanhoSwitchWithinPorte =
      prevMatrix != null &&
      prevKind === 'porte' &&
      nextKind === 'porte' &&
      (newGroup === 'banho_tosa' || newGroup === 'hotel') &&
      (prev.service_group === 'banho_tosa' || prev.service_group === 'hotel') &&
      newGroup !== prev.service_group;

    if (hotelBanhoSwitchWithinPorte) {
      pricing_mode = 'matrix';
      pricing_matrix = prevMatrix;
    } else if (
      prevMatrix != null &&
      prevKind === nextKind &&
      nextKind != null &&
      newGroup === prev.service_group
    ) {
      pricing_mode = prev.pricing_mode;
      pricing_matrix = prevMatrix;
    } else {
      const d = defaultPricingMatrixForGroup(newGroup, { cost_amount: seedCost, sale_amount: seedSale });
      pricing_mode = 'matrix';
      pricing_matrix = d;
    }
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

  return {
    ...prev,
    service_group: newGroup,
    pricing_mode,
    pricing_matrix,
  };
}

function pricingMatrixMoneyCells(t: HubServiceType): {
  costLabel: string;
  saleLabel: string;
  detailTitle: string | undefined;
} {
  const m = coercePricingMatrixFromApi(t.pricing_matrix);
  const baseCost = Number(t.cost_amount ?? 0);
  const baseSale = Number(t.sale_amount ?? 0);
  if (!m) {
    return { costLabel: moneyCell(baseCost), saleLabel: moneyCell(baseSale), detailTitle: undefined };
  }
  const saleR = saleRangeSummary(m);
  const costs = m.tiers.map((x) => x.cost_amount);
  const cMin = Math.min(...costs);
  const cMax = Math.max(...costs);
  const saleLabel =
    saleR.min === saleR.max ? moneyCell(saleR.min) : `${moneyCell(saleR.min)} – ${moneyCell(saleR.max)}`;
  const costLabel = cMin === cMax ? moneyCell(cMin) : `${moneyCell(cMin)} – ${moneyCell(cMax)}`;
  return {
    costLabel,
    saleLabel,
    detailTitle:
      `Varia ${pricingCategoryLabel(m.kind).toLowerCase()}. Na listagem: intervalo mínimo–máximo; margem usa o preço de referência (menor venda).`,
  };
}

function rowStatus(t: HubServiceType): 'ativo' | 'inativo' | 'arquivado' {
  if (t.deleted_at) return 'arquivado';
  if (!t.active) return 'inativo';
  return 'ativo';
}

export type HubServiceCatalog = 'services' | 'addons';

type HubServiceTypesPageProps = {
  catalog?: HubServiceCatalog;
};

const HubServiceTypesPage: React.FC<HubServiceTypesPageProps> = ({ catalog = 'services' }) => {
  const isAddons = catalog === 'addons';
  const basePath = isAddons ? '/hub/servicos/adicionais' : '/hub/servicos/servicos';
  const catalogLabel = isAddons ? 'Adicionais' : 'Serviços';
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();

  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.service_types.write');

  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<HubServiceType[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ativo' | 'inativo' | 'arquivado'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchedule, setFilterSchedule] = useState<'all' | 'yes' | 'no'>('all');

  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [serviceGroups, setServiceGroups] = useState<HubServiceGroupRow[]>([]);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const [typesRes, groupsRes] = await Promise.all([
        hubServiceTypesApi.list(clinicId, true, includeArchived, isAddons),
        hubServiceGroupsApi.list(clinicId, true).catch(() => ({ service_groups: [] as HubServiceGroupRow[] })),
      ]);
      setTypes(typesRes.service_types || []);
      setServiceGroups(groupsRes.service_groups || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || `Erro ao carregar ${catalogLabel.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [clinicId, includeArchived, isAddons, catalogLabel, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void load();
  }, [clinicId, accessAllowed, load]);

  const groupColorBySlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of serviceGroups) {
      if (g.slug && g.color) m.set(g.slug, g.color);
    }
    return m;
  }, [serviceGroups]);

  const formGroupPreviewHex = useMemo(() => {
    const slug = (form.service_group || 'outros').trim();
    const fromRow = groupColorBySlug.get(slug);
    if (fromRow && /^#[0-9A-Fa-f]{6}$/.test(fromRow)) return fromRow;
    return resolveServiceAccentColor(null, slug);
  }, [form.service_group, groupColorBySlug]);

  const groupComboOptionsExtended = useMemo((): HubComboboxOption[] => {
    const customs: HubComboboxOption[] = [];
    const seen = new Set<string>(KNOWN_SERVICE_GROUP_SLUGS);
    for (const t of types) {
      const g = (t.service_group || 'outros').trim();
      if (!g || seen.has(g)) continue;
      seen.add(g);
      customs.push({ value: g, label: serviceGroupLabel(g) });
    }
    customs.sort((a, b) => a.label.localeCompare(b.label, 'pt'));
    const base: HubComboboxOption[] = SERVICE_GROUP_OPTIONS.map((o) => ({
      value: o.value,
      label: o.label,
    }));
    return [...base, ...customs];
  }, [types]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return types.filter((t) => {
      if (filterGroup && (t.service_group || 'outros') !== filterGroup) return false;
      if (filterStatus !== 'all' && rowStatus(t) !== filterStatus) return false;
      if (filterSchedule === 'yes' && t.allow_scheduling === false) return false;
      if (filterSchedule === 'no' && t.allow_scheduling !== false) return false;
      if (q) {
        const name = (t.name || '').toLowerCase();
        const code = (t.code || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [types, filterGroup, filterStatus, filterSchedule, searchQuery]);

  const metrics = useMemo(() => {
    const total = types.length;
    const withDur = types.filter((t) => t.default_duration_minutes != null && (t.default_duration_minutes as number) > 0);
    const avgDur =
      withDur.length > 0
        ? Math.round(
            withDur.reduce((sum, t) => sum + (t.default_duration_minutes as number), 0) / withDur.length
          )
        : null;
    const groupSet = new Set(types.map((t) => t.service_group || 'outros'));
    return { total, avgDur, groupCount: groupSet.size };
  }, [types]);

  const codePreview = slugifyServiceNameToCode(form.name);

  const pricingPreview = useMemo(() => {
    if (form.pricing_mode === 'matrix' && form.pricing_matrix) {
      const err = validatePricingMatrixClient(form.service_group, form.pricing_matrix);
      if (err) return { text: null as string | null };
      const ref = computeReferenceFromMatrix(form.pricing_matrix);
      const m = marginOverSalePct(ref.cost, ref.sale);
      const marginStr =
        m != null
          ? `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %`
          : '—';
      const profit = ref.sale - ref.cost;
      return {
        text: `Referência (menor venda na tabela): lucro unitário ${formatMoneyCurrencyBrl(profit)} · Margem sobre o preço de venda (informativa): ${marginStr}`,
      };
    }
    const cost = parseMoneyInput(form.cost_amount);
    const sale = parseMoneyInput(form.sale_amount);
    if (cost == null || sale == null) {
      return { text: null as string | null };
    }
    const profit = sale - cost;
    const m = marginOverSalePct(cost, sale);
    const marginStr =
      m != null
        ? `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %`
        : '—';
    return {
      text: `Lucro unitário: ${formatMoneyCurrencyBrl(profit)} · Margem sobre o preço de venda (informativa): ${marginStr}`,
    };
  }, [form.cost_amount, form.sale_amount, form.pricing_mode, form.pricing_matrix, form.service_group]);

  const editingRow = useMemo(
    () => (panelMode === 'edit' && editingId ? types.find((x) => x.id === editingId) : undefined),
    [panelMode, editingId, types],
  );

  const openCreate = () => {
    navigate(`${basePath}/novo`);
  };

  const openEdit = (t: HubServiceType) => {
    navigate(`${basePath}/${t.id}/editar`);
  };

  const openDuplicate = (t: HubServiceType) => {
    navigate(`${basePath}/novo?duplicar=${encodeURIComponent(t.id)}`);
  };

  const closePanel = () => {
    setPanelMode('none');
    setEditingId(null);
    setSelectedId(null);
    setForm(emptyForm());
  };

  const handleBootstrap = async () => {
    if (!clinicId || !canWrite) return;
    try {
      const res = await hubServiceTypesApi.bootstrap(clinicId, includeArchived);
      showSuccess(
        res.inserted > 0 ? `Tipos padrão criados (${res.inserted}).` : 'Tipos padrão já existiam; lista atualizada.'
      );
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro no bootstrap');
    }
  };

  const parseDuration = (): number | null => {
    const s = form.default_duration_minutes.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const name = form.name.trim();
    if (!name) {
      showError('Indique o nome do serviço.');
      return;
    }
    if (!form.service_group) {
      showError('selecione o grupo.');
      return;
    }
    const dur = parseDuration();
    if (form.default_duration_minutes.trim() && dur == null) {
      showError('Duração inválida: use um número inteiro maior que zero ou deixe vazio.');
      return;
    }
    let costVal = parseMoneyInput(form.cost_amount);
    let saleVal = parseMoneyInput(form.sale_amount);
    let pricingMatrixPayload: HubServicePricingMatrix | null = null;

    const useMatrix =
      supportsPricingMatrixGroup(form.service_group) && form.pricing_mode === 'matrix' && form.pricing_matrix != null;

    if (useMatrix && form.pricing_matrix) {
      const err = validatePricingMatrixClient(form.service_group, form.pricing_matrix);
      if (err) {
        showError(err);
        return;
      }
      const ref = computeReferenceFromMatrix(form.pricing_matrix);
      costVal = ref.cost;
      saleVal = ref.sale;
      pricingMatrixPayload = form.pricing_matrix;
    } else {
      pricingMatrixPayload = null;
    }

    if (costVal == null) {
      showError('Indique o valor de custo (número ≥ 0).');
      return;
    }
    if (saleVal == null) {
      showError('Indique o valor de venda (número ≥ 0).');
      return;
    }

    setSaving(true);
    try {
      if (panelMode === 'create') {
      await hubServiceTypesApi.create({
        clinic_id: clinicId,
          name,
          service_group: form.service_group,
          cost_amount: costVal,
          sale_amount: saleVal,
          pricing_matrix: pricingMatrixPayload,
          default_duration_minutes: dur,
          description: form.description.trim() || null,
          allow_scheduling: form.allow_scheduling,
          internal_notes: form.internal_notes.trim() || null,
        });
        showSuccess('Serviço criado');
      } else if (panelMode === 'edit' && editingId) {
        await hubServiceTypesApi.update(editingId, {
          clinic_id: clinicId,
        name,
          service_group: form.service_group,
          cost_amount: costVal,
          sale_amount: saleVal,
          pricing_matrix: pricingMatrixPayload,
        default_duration_minutes: dur,
          description: form.description.trim() || null,
          allow_scheduling: form.allow_scheduling,
          internal_notes: form.internal_notes.trim() || null,
          code_locked: form.code_locked,
      });
        showSuccess('Serviço atualizado');
      }
      await load();
      closePanel();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (t: HubServiceType) => {
    if (!clinicId || !canWrite || t.deleted_at) return;
    void (async () => {
      try {
        await hubServiceTypesApi.update(t.id, {
          clinic_id: clinicId,
          active: !t.active,
        });
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao atualizar');
      }
    })();
  };

  const archiveType = (t: HubServiceType) => {
    if (!clinicId || !canWrite) return;
    showConfirm(`Arquivar o serviço "${t.name}"?`, () => {
      void (async () => {
        try {
          await hubServiceTypesApi.update(t.id, { clinic_id: clinicId, archived: true });
          showSuccess('Serviço arquivado');
          await load();
          if (editingId === t.id) closePanel();
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao arquivar');
        }
      })();
    }, 'Arquivar');
  };

  const unarchiveType = (t: HubServiceType) => {
    if (!clinicId || !canWrite) return;
    void (async () => {
      try {
        await hubServiceTypesApi.update(t.id, { clinic_id: clinicId, archived: false });
        showSuccess('Serviço restaurado');
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao restaurar');
      }
    })();
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-servicos-page hub-pets-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">selecione uma clínica para gerir serviços.</p>
        </div>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-servicos-page hub-pets-page" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  const needsBootstrap = types.length === 0 && !includeArchived;

  return (
    <div className="hub-clientes hub-servicos-page hub-pets-page">
      <div className="hub-clientes__main">
        {!isAddons && needsBootstrap && canWrite && (
          <div className="hub-clientes__empty-state" style={{ marginBottom: 20, textAlign: 'left' }}>
            <p style={{ margin: '0 0 12px' }}>Ainda não há serviços nesta clínica. Pode criar os tipos padrão (consulta, banho e tosa, hotel) com um clique.</p>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void handleBootstrap()}>
              Criar tipos padrão
            </button>
          </div>
        )}

        <div className="hub-servicos__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Total de {catalogLabel.toLowerCase()}</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total.toLocaleString('pt-BR')}</div>
              <div className="hub-servicos__metric-sub">Nesta clínica (lista atual)</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <LayoutGrid size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Duração média</div>
              <div className="hub-servicos__metric-value">
                {loading ? '—' : metrics.avgDur != null ? `${metrics.avgDur} min` : '—'}
              </div>
              <div className="hub-servicos__metric-sub">Só serviços com duração definida</div>
            </div>
            <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
              <Timer size={22} strokeWidth={1.75} />
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Grupos</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.groupCount.toLocaleString('pt-BR')}</div>
              <div className="hub-servicos__metric-sub">Categorias distintas em uso</div>
            </div>
            <div className="hub-servicos__metric-icon" aria-hidden>
              <Layers size={22} strokeWidth={1.75} />
            </div>
          </div>
        </div>

        <div className="hub-servicos__toolbar">
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__search-wrap">
              <div className="hub-servicos__search-field">
                <span className="hub-servicos__search-icon">
                  <Search size={18} strokeWidth={2} />
                </span>
                <input
                  type="search"
                  className="hub-servicos__search-input"
                  placeholder={
                    isAddons ? 'Buscar adicional por nome ou código…' : 'Buscar serviço por nome ou código…'
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={
                    isAddons ? 'Buscar adicional por nome ou código' : 'Buscar serviço por nome ou código'
                  }
                />
              </div>
            </div>
            {canWrite && (
              <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                <Plus size={20} strokeWidth={2.25} aria-hidden />
                {isAddons ? 'Novo adicional' : 'Novo serviço'}
              </button>
            )}
          </div>
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__filter-field">
              <span className="hub-clientes__label">Grupo</span>
              <select
                className="hub-clientes__select-input"
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                aria-label="Filtrar por grupo"
              >
                <option value="">Todos os grupos</option>
                {groupComboOptionsExtended.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="hub-servicos__filter-field">
              <span className="hub-clientes__label">Estado</span>
              <select
                className="hub-clientes__select-input"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                aria-label="Filtrar por estado"
              >
                <option value="all">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </div>
            {!isAddons ? (
              <div className="hub-servicos__filter-field">
                <span className="hub-clientes__label">Agendamento</span>
                <select
                  className="hub-clientes__select-input"
                  value={filterSchedule}
                  onChange={(e) => setFilterSchedule(e.target.value as typeof filterSchedule)}
                  aria-label="Filtrar por permite agendamento"
                >
                  <option value="all">Todos</option>
                  <option value="yes">Permite</option>
                  <option value="no">Não permite</option>
                </select>
              </div>
            ) : null}
            <div className="hub-servicos__filter-field hub-servicos__filter-field--check">
              <span className="hub-clientes__label">Lista</span>
              <HubCheckbox
                className="hub-servicos__filter-checkbox"
                checked={includeArchived}
                onChange={setIncludeArchived}
              >
                Incluir arquivados
              </HubCheckbox>
            </div>
            <div style={{ flex: 1 }} />
            {canWrite && (
              <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void handleBootstrap()}>
                Garantir tipos padrão
              </button>
            )}
          </div>
        </div>

          {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Grupo</th>
                  <th className="hub-servicos__td-money">Custo</th>
                  <th className="hub-servicos__td-money">Venda</th>
                  <th>Margem</th>
                  <th>Duração</th>
                  <th>Agend.</th>
                  <th>Estado</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      Nenhum serviço com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((t) => {
                    const st = rowStatus(t);
                    const sel = selectedId === t.id;
                    const pmCells = pricingMatrixMoneyCells(t);
                    const cost = Number(t.cost_amount ?? 0);
                    const sale = Number(t.sale_amount ?? 0);
                    const m = marginOverSalePct(cost, sale);
                    const marginLabel =
                      m != null
                        ? `${m.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })} %`
                        : '—';
                    const accent = resolveServiceAccentColor(
                      t.group_color ?? t.agenda_color,
                      t.service_group || 'outros'
                    );
                    const desc = (t.description || '').trim();
                    return (
                      <tr
                        key={t.id}
                        className={sel ? 'hub-clientes__row--selected' : undefined}
                        onClick={() => {
                          setSelectedId(t.id);
                          if (canWrite) openEdit(t);
                        }}
                      >
                        <td>
                          <div className="hub-servicos__svc-cell">
                            <div
                              className="hub-servicos__svc-icon-ring"
                              style={{ backgroundColor: hexToSoftFill(accent, 0.22) }}
                              aria-hidden
                            >
                              <ServiceGroupIcon group={t.service_group || 'outros'} color={accent} size={22} />
                            </div>
                            <div className="hub-servicos__metric-card__text">
                              <div className="hub-servicos__svc-title">{t.name}</div>
                              {desc ? <div className="hub-servicos__svc-desc">{truncateDesc(desc, 120)}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="hub-servicos__group-label" style={{ color: accent }}>
                            <span className="hub-servicos__group-dot" style={{ backgroundColor: accent }} />
                            {serviceGroupLabel(t.service_group || 'outros')}
                          </span>
                        </td>
                        <td className="hub-servicos__td-money" title={pmCells.detailTitle}>
                          {pmCells.costLabel}
                        </td>
                        <td className="hub-servicos__td-money" title={pmCells.detailTitle}>
                          {pmCells.saleLabel}
                        </td>
                        <td title="Margem sobre o preço de venda (informativa)">{marginLabel}</td>
                        <td>{t.default_duration_minutes != null ? `${t.default_duration_minutes} min` : '—'}</td>
                        <td>
                          <div className="hub-servicos__sched-ic">
                            {t.allow_scheduling !== false ? (
                              <CalendarCheck2 size={22} strokeWidth={2} style={{ color: '#2e7d32' }} aria-label="Permite agendamento" />
                            ) : (
                              <CalendarX2 size={22} strokeWidth={2} style={{ color: '#c62828' }} aria-label="Não permite agendamento" />
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`hub-clientes__pill ${
                              st === 'ativo'
                                ? 'hub-clientes__pill--active'
                                : st === 'inativo'
                                  ? 'hub-clientes__pill--inactive'
                                  : 'hub-clientes__pill--inactive'
                            }`}
                          >
                            {st === 'ativo' ? 'Ativo' : st === 'inativo' ? 'Inativo' : 'Arquivado'}
                          </span>
                        </td>
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          {canWrite ? (
                            <div className="hub-servicos__row-actions">
                              <button type="button" className="hub-servicos__icon-btn" title="Editar" onClick={() => openEdit(t)}>
                                <Pencil size={18} strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                className="hub-servicos__icon-btn"
                                title="Duplicar serviço"
                                onClick={() => openDuplicate(t)}
                              >
                                <Copy size={18} strokeWidth={2} />
                              </button>
                              {!t.deleted_at ? (
                                <>
                                  <button
                                    type="button"
                                    className="hub-servicos__icon-btn"
                                    title={t.active ? 'Desativar' : 'Ativar'}
                                    onClick={() => toggleActive(t)}
                                  >
                                    {t.active ? <PauseCircle size={18} strokeWidth={2} /> : <PlayCircle size={18} strokeWidth={2} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                                    title="Arquivar"
                                    onClick={() => archiveType(t)}
                                  >
                                    <Archive size={18} strokeWidth={2} />
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="hub-servicos__icon-btn" title="Restaurar" onClick={() => unarchiveType(t)}>
                                  <RotateCcw size={18} strokeWidth={2} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="hub-clientes__muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {false ? (
      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {panelMode === 'none' ? (
            <p className="hub-clientes__muted" style={{ margin: 0 }}>
              {canWrite
                ? 'Clique numa linha para editar ou use «Novo serviço».'
                : 'Sem permissão para criar ou editar serviços.'}
            </p>
          ) : !canWrite ? (
            <p className="hub-clientes__muted">Sem permissão de escrita.</p>
          ) : (
            <form onSubmit={handleSave}>
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  {panelMode === 'create' ? 'Novo serviço' : 'Editar serviço'}
                </h2>
                <button type="button" className="hub-clientes__panel-close" aria-label="Fechar" onClick={closePanel}>
                  ×
                </button>
              </div>

              <div className="hub-servicos__form-section">
                <h3 className="hub-servicos__form-section-title">Informações gerais</h3>

                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="svc-group">
                    Grupo *
                  </label>
                  <HubSearchableCombobox
                    id="svc-group"
                    className="hub-combobox--clientes"
                    options={groupComboOptionsExtended}
                    value={form.service_group}
                    onChange={(raw) => {
                      const slug = normalizeServiceGroupInput(raw);
                      setForm((f) => applySvcGroupChange(f, slug));
                    }}
                    placeholder="Selecionar grupo"
                    searchPlaceholder="Buscar ou criar grupo…"
                    allowCreate
                    createEntityLabel="grupo"
                    clearable={false}
                    ariaLabel="Grupo do serviço"
                  />
                  <p className="hub-servicos__margin-info" style={{ marginTop: 6 }}>
                    {SERVICE_GROUP_HINTS[form.service_group] ?? CUSTOM_GROUP_HINT}
                  </p>
                  <div className="hub-servicos__group-color-preview">
                    <span
                      className="hub-servicos__group-color-preview-dot"
                      style={{
                        backgroundColor: formGroupPreviewHex,
                        boxShadow: `0 0 0 2px ${hexToSoftFill(formGroupPreviewHex, 0.4)}`,
                      }}
                      aria-hidden
                    />
                    <p className="hub-servicos__margin-info hub-servicos__group-color-preview-text">
                      Cor na agenda para este grupo vem de{' '}
                      <Link
                        to="/hub/configuracoes-sistema/servicos-funcoes"
                        className="hub-servicos-config__back-link"
                      >
                        Configurações do Sistema → Serviços e Funções
                      </Link>
                      .
                    </p>
                  </div>
                </div>

                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="svc-name">
                    Nome do serviço *
                  </label>
                  <input
                    id="svc-name"
                    className="hub-clientes__input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex.: Banho Premium"
                    required
                  />
                </div>

                <div className="hub-clientes__field">
                  <span className="hub-clientes__label">Código</span>
                  <div className="hub-servicos__code-box">
                    {panelMode === 'edit' && editingRow ? editingRow!.code : codePreview || '…'}
                  </div>
                  <div className="hub-servicos__code-box-muted">Gerado automaticamente a partir do nome (ajustável com sufixo se houver duplicados).</div>
                  {panelMode === 'edit' && editingRow ? (
                    <>
                      {!form.code_locked ? (
                        <div className="hub-servicos__code-preview">Ao salvar sem código fixo, o código passará a: {codePreview || '…'}</div>
                      ) : (
                        <div className="hub-servicos__code-preview">Código fixo: alterações de nome não mudam o código.</div>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="svc-dur">
                    Duração padrão (minutos, opcional)
                  </label>
                  <input
                    id="svc-dur"
                    className="hub-clientes__input"
                    type="number"
                    min={1}
                    value={form.default_duration_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, default_duration_minutes: e.target.value }))}
                    placeholder="Ex.: 60"
                  />
                </div>

                <div className="hub-clientes__field">
                  <span className="hub-clientes__label">Permite agendamento?</span>
                  <div className="hub-servicos__seg" role="group" aria-label="Permite agendamento">
                    <button
                      type="button"
                      className={form.allow_scheduling ? 'hub-servicos__seg--active' : ''}
                      onClick={() => setForm((f) => ({ ...f, allow_scheduling: true }))}
                    >
                      Sim
                    </button>
                  <button
                    type="button"
                      className={!form.allow_scheduling ? 'hub-servicos__seg--active' : ''}
                      onClick={() => setForm((f) => ({ ...f, allow_scheduling: false }))}
                    >
                      Não
                  </button>
                  </div>
                </div>

                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="svc-desc">
                    Descrição (opcional)
                  </label>
                  <textarea
                    id="svc-desc"
                    className="hub-clientes__textarea"
                    value={form.description}
                    maxLength={DESC_MAX}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Resumo visível na lista de serviços"
                    rows={3}
                  />
                  <div className="hub-servicos__char-count">
                    {form.description.length}/{DESC_MAX}
                  </div>
                </div>
              </div>

              <div className="hub-servicos__form-section">
                <h3 className="hub-servicos__form-section-title">Precificação (R$)</h3>

                {supportsPricingMatrixGroup(form.service_group) ? (
                  <div className="hub-clientes__field">
                    <span className="hub-clientes__label">Modo</span>
                    <div className="hub-servicos__seg" role="group" aria-label="Modo de precificação">
                      <button
                        type="button"
                        className={form.pricing_mode === 'simple' ? 'hub-servicos__seg--active' : ''}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            pricing_mode: 'simple',
                            pricing_matrix: null,
                          }))
                        }
                      >
                        Preço único
                      </button>
                      <button
                        type="button"
                        className={form.pricing_mode === 'matrix' ? 'hub-servicos__seg--active' : ''}
                        onClick={() => {
                          setForm((f) => {
                            const seedC = parseMoneyInput(f.cost_amount) ?? 0;
                            const seedS = parseMoneyInput(f.sale_amount) ?? 0;
                            const m = defaultPricingMatrixForGroup(f.service_group, {
                              cost_amount: seedC,
                              sale_amount: seedS,
                            });
                            if (!m) return { ...f, pricing_mode: 'simple', pricing_matrix: null };
                            const ref = computeReferenceFromMatrix(m);
                            return {
                              ...f,
                              pricing_mode: 'matrix',
                              pricing_matrix: m,
                              cost_amount: formatMoneyNumberBrl(ref.cost),
                              sale_amount: formatMoneyNumberBrl(ref.sale),
                            };
                          });
                        }}
                      >
                        Preço por categorias
                      </button>
                    </div>
                    <p className="hub-servicos__margin-info" style={{ marginTop: 6 }}>
                      Um único serviço pode ter vários preços por categorias, como porte, pelagem, período, consulta ou km.
                    </p>
                  </div>
                ) : null}

                {form.pricing_mode === 'matrix' && form.pricing_matrix ? (
                  <>
                    {form.service_group === 'banho_tosa' ? (
                      <div className="hub-clientes__field">
                        <span className="hub-clientes__label">Categoria de preço</span>
                        <div className="hub-servicos__seg" role="group" aria-label="Categoria de preço">
                          {(
                            [
                              ['porte', 'Por porte'],
                              ['pelagem', 'Por pelagem'],
                              ['porte_pelagem', 'Por porte + pelagem'],
                            ] as const
                          ).map(([kind, label]) => (
                            <button
                              key={kind}
                              type="button"
                              className={form.pricing_matrix?.kind === kind ? 'hub-servicos__seg--active' : ''}
                              onClick={() => {
                                setForm((f) => {
                                  const seedC = parseMoneyInput(f.cost_amount) ?? 0;
                                  const seedS = parseMoneyInput(f.sale_amount) ?? 0;
                                  const next = defaultPricingMatrixForKind(kind, {
                                    cost_amount: seedC,
                                    sale_amount: seedS,
                                  });
                                  const ref = computeReferenceFromMatrix(next);
                                  return {
                                    ...f,
                                    pricing_mode: 'matrix',
                                    pricing_matrix: next,
                                    cost_amount: formatMoneyNumberBrl(ref.cost),
                                    sale_amount: formatMoneyNumberBrl(ref.sale),
                                  };
                                });
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <ServicePricingMatrixEditor
                      serviceGroup={form.service_group}
                      matrix={form.pricing_matrix!}
                      formatMoneyNumber={formatMoneyNumberBrl}
                      parseMoney={parseMoneyInput}
                      onChange={(next) => {
                        setForm((f) => {
                          const ref = computeReferenceFromMatrix(next);
                          return {
                            ...f,
                            pricing_matrix: next,
                            cost_amount: formatMoneyNumberBrl(ref.cost),
                            sale_amount: formatMoneyNumberBrl(ref.sale),
                          };
                        });
                      }}
                    />
                    <p className="hub-servicos__margin-info" role="status">
                      Na listagem e na margem usamos o menor valor de venda da tabela como referência.
                    </p>
                  </>
                ) : (
                  <div className="hub-servicos__price-grid">
                    <div>
                      <label className="hub-clientes__label" htmlFor="svc-cost">
                        Valor de custo *
                      </label>
                      <div className="hub-servicos__money-field">
                        <span className="hub-servicos__money-prefix">R$</span>
                        <input
                          id="svc-cost"
                          className="hub-clientes__input"
                          inputMode="decimal"
                          autoComplete="off"
                          value={form.cost_amount}
                          onChange={(e) => setForm((f) => ({ ...f, cost_amount: e.target.value }))}
                          placeholder="0,00"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="hub-clientes__label" htmlFor="svc-sale">
                        Valor de venda *
                      </label>
                      <div className="hub-servicos__money-field">
                        <span className="hub-servicos__money-prefix">R$</span>
                        <input
                          id="svc-sale"
                          className="hub-clientes__input"
                          inputMode="decimal"
                          autoComplete="off"
                          value={form.sale_amount}
                          onChange={(e) => setForm((f) => ({ ...f, sale_amount: e.target.value }))}
                          placeholder="0,00"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}

                {pricingPreview.text ? (
                  <p className="hub-servicos__margin-info" role="status">
                    {pricingPreview.text}
                  </p>
                ) : (
                  <p className="hub-servicos__margin-info">
                    Margem de lucro (informativa): preencha custo e venda para ver o lucro unitário e a margem sobre o preço de
                    venda.
                  </p>
                )}
              </div>

              <div className="hub-servicos__form-section">
                <h3 className="hub-servicos__form-section-title">Observações internas</h3>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="svc-notes">
                    Notas (opcional)
                  </label>
                  <textarea
                    id="svc-notes"
                    className="hub-clientes__textarea"
                    value={form.internal_notes}
                    onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                    placeholder="Visível apenas para a equipa"
                    rows={3}
                  />
                </div>
              </div>

              {panelMode === 'edit' && (
                <div className="hub-servicos__form-section">
                  <h3 className="hub-servicos__form-section-title">Código interno</h3>
                  <div className="hub-clientes__field">
                    <HubCheckbox
                      checked={form.code_locked}
                      onChange={(code_locked) => setForm((f) => ({ ...f, code_locked }))}
                    >
                      Fixar código interno (o nome já não atualiza o código automaticamente)
                    </HubCheckbox>
                        </div>
                      </div>
              )}

              <div className="hub-clientes__footer-btns" style={{ borderTop: '1px solid var(--hc-border)', paddingTop: 16, marginTop: 8 }}>
                <div className="hub-clientes__btn-row">
                  <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar serviço'}
                          </button>
                  <HubCancelButton onClick={closePanel} />
                        </div>
              </div>
            </form>
          )}
        </div>
      </aside>
      ) : null}
      </div>
  );
};

export default HubServiceTypesPage;
