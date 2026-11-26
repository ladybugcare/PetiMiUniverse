import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  HelpCircle,
  Pencil,
  Percent,
  Plus,
  Scale,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  hubFinancialApi,
  type HubCommissionBasis,
  type HubCommissionPreviewResponse,
  type HubCommissionRule,
  type HubFinanceReceivable,
} from '../../api/hubFinancialApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { formatComandaOriginLabel } from './comandaListPreview';

type CommissionTargetKind = 'service' | 'product';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

const BASIS_LABELS: Record<HubCommissionBasis, string> = {
  percent_of_sale: '% do item',
  fixed_per_sale: 'Valor fixo por item',
};

const BASIS_CHIP: Record<HubCommissionBasis, string> = {
  percent_of_sale: '% do item',
  fixed_per_sale: 'Valor fixo',
};

const BASIS_HELP: Record<HubCommissionBasis, string> = {
  percent_of_sale: 'Calcula a comissão sobre o valor daquele item na cobrança.',
  fixed_per_sale: 'Paga um valor fixo cada vez que o item aparece. Nunca passa do valor do item.',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

type ActiveFilter = 'active' | 'inactive' | 'all';

const ACTIVE_FILTERS: { id: ActiveFilter; label: string }[] = [
  { id: 'active', label: 'Ativas' },
  { id: 'inactive', label: 'Inativas' },
  { id: 'all', label: 'Todas' },
];

/** Exemplo didático usado na tela e no painel. */
const EXAMPLE_ITEM_AMOUNT = 80;

function formatRate(basis: HubCommissionBasis, rate: number): string {
  if (basis === 'percent_of_sale') return `${rate}%`;
  return formatBrl(rate);
}

function parseRateInput(raw: string): number | null {
  const value = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function estimateCommission(basis: HubCommissionBasis, rate: number, itemAmount: number): number {
  if (basis === 'percent_of_sale') {
    return Math.round(((itemAmount * rate) / 100 + Number.EPSILON) * 100) / 100;
  }
  return Math.min(rate, itemAmount);
}

function targetOf(
  rule: HubCommissionRule,
  types: HubServiceType[],
  products: HubInventoryItem[],
): { kind: CommissionTargetKind; name: string; meta: string } {
  if (rule.hub_inventory_item_id) {
    const emb = embedOne(rule.hub_inventory_items);
    if (emb) {
      return {
        kind: 'product',
        name: emb.name,
        meta: emb.store_sku ? `SKU ${emb.store_sku}` : 'Produto',
      };
    }
    const found = products.find((p) => p.id === rule.hub_inventory_item_id);
    if (found) {
      return {
        kind: 'product',
        name: found.name,
        meta: found.store_sku ? `SKU ${found.store_sku}` : 'Produto',
      };
    }
    return { kind: 'product', name: 'Produto removido', meta: 'Produto' };
  }
  const emb = embedOne(rule.hub_service_types);
  if (emb) {
    return {
      kind: 'service',
      name: emb.name,
      meta: emb.service_group ? serviceGroupLabel(emb.service_group) : emb.code || 'Serviço',
    };
  }
  const found = types.find((t) => t.id === rule.hub_service_type_id);
  if (found) {
    return {
      kind: 'service',
      name: found.name,
      meta: found.service_group ? serviceGroupLabel(found.service_group) : found.code || 'Serviço',
    };
  }
  return { kind: 'service', name: 'Serviço removido', meta: 'Serviço' };
}

type Props = {
  clinicId: string;
  unitId: string;
  canWrite: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
};

const HubCommissionsSection: React.FC<Props> = ({ clinicId, unitId, canWrite, showError, showSuccess }) => {
  const [rules, setRules] = useState<HubCommissionRule[]>([]);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [products, setProducts] = useState<HubInventoryItem[]>([]);
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [search, setSearch] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [targetKind, setTargetKind] = useState<CommissionTargetKind>('service');
  const [targetId, setTargetId] = useState('');
  const [basis, setBasis] = useState<HubCommissionBasis>('percent_of_sale');
  const [rate, setRate] = useState('10');
  const [notes, setNotes] = useState('');

  const [previewReceivableId, setPreviewReceivableId] = useState('');
  const [preview, setPreview] = useState<HubCommissionPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [nextRules, stRes, itemsRes, rec] = await Promise.all([
          hubFinancialApi.listCommissionRules(clinicId, { includeInactive: true }),
          hubServiceTypesApi.list(clinicId, false, true),
          hubInventoryApi.items.list(clinicId, true),
          hubFinancialApi.listReceivables(clinicId, { unit_id: unitId }),
        ]);
        setRules(nextRules);
        setServiceTypes(stRes.service_types ?? []);
        setProducts((itemsRes.items ?? []).filter((p) => p.active && !p.deleted_at));
        setReceivables(rec.filter((r) => r.status !== 'cancelled' && r.status !== 'refunded').slice(0, 80));
      } catch (e) {
        showError((e as Error)?.message || 'Erro ao carregar comissões');
      } finally {
        setLoading(false);
      }
    },
    [clinicId, unitId, showError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = normalizeText(search.trim());
    return rules.filter((rule) => {
      if (activeFilter === 'active' && !rule.active) return false;
      if (activeFilter === 'inactive' && rule.active) return false;
      if (!term) return true;
      const target = targetOf(rule, serviceTypes, products);
      const haystack = normalizeText(
        [target.name, target.meta, target.kind === 'product' ? 'produto' : 'servico', rule.notes, BASIS_LABELS[rule.basis]]
          .filter(Boolean)
          .join(' '),
      );
      return haystack.includes(term);
    });
  }, [rules, activeFilter, search, serviceTypes, products]);

  const activeCount = rules.filter((r) => r.active).length;
  const filtersNarrowed = activeFilter !== 'active' || search.trim().length > 0;

  const serviceOptions: HubComboboxOption[] = useMemo(
    () =>
      serviceTypes
        .filter((s) => s.active && !s.deleted_at)
        .map((s) => {
          const group = serviceGroupLabel(s.service_group);
          return {
            value: s.id,
            label: group ? `${s.name} · ${group}` : s.name,
            searchText: [s.name, s.code, group].filter(Boolean).join(' '),
          };
        }),
    [serviceTypes],
  );

  const productOptions: HubComboboxOption[] = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.store_sku ? `${p.name} · ${p.store_sku}` : p.name,
        searchText: [p.name, p.store_sku, p.ean].filter(Boolean).join(' '),
      })),
    [products],
  );

  const selectedService = useMemo(
    () => (targetKind === 'service' ? serviceTypes.find((s) => s.id === targetId) ?? null : null),
    [serviceTypes, targetId, targetKind],
  );

  const selectedProduct = useMemo(
    () => (targetKind === 'product' ? products.find((p) => p.id === targetId) ?? null : null),
    [products, targetId, targetKind],
  );

  const receivableOptions: HubComboboxOption[] = useMemo(
    () =>
      receivables.map((r) => {
        const guardian = r.guardian?.full_name?.trim();
        const origin = formatComandaOriginLabel(r.source_type);
        const status = STATUS_LABELS[r.status] ?? r.status;
        const amount = formatBrl(Number(r.final_amount));
        return {
          value: r.id,
          label: [guardian || origin, amount, status].join(' · '),
          searchText: [guardian, origin, r.source_id, status].filter(Boolean).join(' '),
        };
      }),
    [receivables],
  );

  const rateValue = parseRateInput(rate);
  const exampleCommission =
    rateValue == null
      ? null
      : estimateCommission(
          basis,
          basis === 'percent_of_sale' && rateValue > 100 ? 100 : rateValue,
          EXAMPLE_ITEM_AMOUNT,
        );

  const resetForm = () => {
    setEditingId(null);
    setTargetKind('service');
    setTargetId('');
    setBasis('percent_of_sale');
    setRate('10');
    setNotes('');
  };

  const openCreate = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEdit = (rule: HubCommissionRule) => {
    setEditingId(rule.id);
    if (rule.hub_inventory_item_id) {
      setTargetKind('product');
      setTargetId(rule.hub_inventory_item_id);
    } else {
      setTargetKind('service');
      setTargetId(rule.hub_service_type_id ?? '');
    }
    setBasis(rule.basis);
    setRate(String(rule.rate).replace('.', ','));
    setNotes(rule.notes ?? '');
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (saving) return;
    setPanelOpen(false);
    resetForm();
  };

  const onSave = async () => {
    if (!canWrite) {
      showError('Sem permissão para alterar regras de comissão.');
      return;
    }
    if (!targetId) {
      showError(targetKind === 'product' ? 'Escolha um produto.' : 'Escolha um tipo de serviço.');
      return;
    }
    const value = parseRateInput(rate);
    if (value == null) {
      showError('Informe uma taxa válida.');
      return;
    }
    if (basis === 'percent_of_sale' && value > 100) {
      showError('A porcentagem não pode passar de 100.');
      return;
    }
    setSaving(true);
    try {
      await hubFinancialApi.upsertCommissionRule({
        clinic_id: clinicId,
        hub_service_type_id: targetKind === 'service' ? targetId : null,
        hub_inventory_item_id: targetKind === 'product' ? targetId : null,
        basis,
        rate: value,
        notes: notes.trim() || null,
      });
      showSuccess(editingId ? 'Regra atualizada.' : 'Regra salva.');
      setPanelOpen(false);
      resetForm();
      setPreview(null);
      await load(true);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao salvar regra');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (rule: HubCommissionRule) => {
    if (!canWrite || busyId) return;
    setBusyId(rule.id);
    try {
      await hubFinancialApi.patchCommissionRule(rule.id, {
        clinic_id: clinicId,
        active: !rule.active,
      });
      showSuccess(rule.active ? 'Regra desativada.' : 'Regra ativada.');
      setPreview(null);
      await load(true);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (rule: HubCommissionRule) => {
    if (!canWrite || busyId) return;
    const target = targetOf(rule, serviceTypes, products);
    if (!window.confirm(`Remover a comissão de "${target.name}"?`)) return;
    setBusyId(rule.id);
    try {
      await hubFinancialApi.deleteCommissionRule(rule.id, clinicId);
      if (editingId === rule.id) {
        setPanelOpen(false);
        resetForm();
      }
      showSuccess('Regra removida.');
      setPreview(null);
      await load(true);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover');
    } finally {
      setBusyId(null);
    }
  };

  const onPreview = async () => {
    if (!previewReceivableId) {
      showError('Escolha uma cobrança para simular.');
      return;
    }
    setPreviewLoading(true);
    try {
      setPreview(await hubFinancialApi.getCommissionPreview(clinicId, previewReceivableId));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao calcular a simulação');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <section className="hub-finance-page__section hub-payables hub-expenses hub-commissions">
      <div className="hub-payables__head">
        <div className="hub-payables__head-copy">
          <h2 className="hub-clientes__form-title">Comissões</h2>
          <p className="hub-clientes__subtitle">
            Defina quanto a equipe recebe por serviço ou produto. O cálculo é por item da cobrança — não pelo
            total geral.
          </p>
        </div>
        <div className="hub-payables__head-aside">
          {!loading ? (
            <div className="hub-payables__stat">
              <span className="hub-payables__stat-label">Ativas</span>
              <span className="hub-payables__stat-value">{activeCount}</span>
              <span className="hub-expenses__stat-meta">
                {rules.length} regra{rules.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
          {canWrite ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova regra
            </button>
          ) : null}
        </div>
      </div>

      <div className="hub-finance-page__callout hub-finance-page__callout--hint" role="note">
        <HelpCircle size={18} className="hub-finance-page__callout-icon" aria-hidden />
        <div>
          <strong>Como a comissão é atribuída</strong>
          <p className="hub-commissions__callout-text">
            Serviços: comissão de quem <strong>realizou</strong> o serviço. Produtos: de quem{' '}
            <strong>vendeu</strong>. A regra olha cada item (ex.: Banho de {formatBrl(EXAMPLE_ITEM_AMOUNT)}{' '}
            com 10% → {formatBrl(8)}). Alterar ou desativar uma regra afeta somente apurações futuras — o
            valor na venda fica congelado.
          </p>
        </div>
      </div>

      {!canWrite ? <p className="hub-clientes__muted">Apenas leitura — sem permissão para alterar regras.</p> : null}

      <div className="hub-expenses__toolbar">
        <div className="hub-payables__filters" role="group" aria-label="Filtrar por situação">
          {ACTIVE_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`hub-dayboard__toggle-btn${activeFilter === item.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setActiveFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="hub-expenses__toolbar-row">
          <div className="hub-dayboard__search-wrap hub-expenses__search">
            <Search size={14} className="hub-dayboard__search-icon" aria-hidden />
            <input
              type="text"
              className="hub-dayboard__search"
              placeholder="Buscar serviço, produto ou setor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar comissão"
            />
            {search ? (
              <button type="button" className="hub-dayboard__search-clear" aria-label="Limpar busca" onClick={() => setSearch('')}>
                <X size={12} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <HubLoading variant="block" label="Carregando comissões…" />
      ) : visible.length === 0 ? (
        <div className="hub-finance-page__empty" role="status">
          <span className="hub-finance-page__empty-icon" aria-hidden>
            <Scale size={24} strokeWidth={1.75} />
          </span>
          <p className="hub-finance-page__empty-title">
            {filtersNarrowed ? 'Nenhuma regra com esses filtros' : 'Nenhuma comissão ativa'}
          </p>
          <p className="hub-finance-page__empty-desc">
            {filtersNarrowed
              ? 'Limpe a busca ou escolha outra situação.'
              : 'Cadastre uma regra por serviço ou produto (ex.: Banho 10%) para estimar a comissão na simulação abaixo.'}
          </p>
          {canWrite && !filtersNarrowed ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" style={{ marginTop: 12 }} onClick={openCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nova regra
            </button>
          ) : null}
        </div>
      ) : (
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
            <thead>
              <tr>
                <th>Alvo</th>
                <th>Como calcula</th>
                <th className="hub-finance-page__th-num">Taxa</th>
                <th>Situação</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((rule) => {
                const target = targetOf(rule, serviceTypes, products);
                return (
                  <tr key={rule.id} className={editingId === rule.id ? 'hub-payables__row--active' : undefined}>
                    <td>
                      <span className="hub-payables__payee">{target.name}</span>
                      <span className="hub-expenses__notes">
                        {target.kind === 'product' ? 'Produto' : 'Serviço'}
                        {target.meta ? ` · ${target.meta}` : ''}
                        {rule.notes ? ` · ${rule.notes}` : ''}
                      </span>
                    </td>
                    <td>
                      <span className="hub-payables__chip" title={BASIS_HELP[rule.basis]}>
                        {BASIS_CHIP[rule.basis] ?? rule.basis}
                      </span>
                    </td>
                    <td className="hub-finance-page__td-num">
                      <span className="hub-payables__amount">{formatRate(rule.basis, Number(rule.rate))}</span>
                    </td>
                    <td>
                      <span
                        className={`hub-finance-page__status-pill ${
                          rule.active ? 'hub-finance-page__status-pill--paid' : 'hub-finance-page__status-pill--cancelled'
                        }`}
                      >
                        {rule.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="hub-clientes__td-actions">
                      {canWrite ? (
                        <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Editar"
                            aria-label={`Editar comissão de ${target.name}`}
                            disabled={busyId === rule.id}
                            onClick={() => openEdit(rule)}
                          >
                            <Pencil size={15} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title={rule.active ? 'Desativar' : 'Ativar'}
                            aria-label={
                              rule.active
                                ? `Desativar comissão de ${target.name}`
                                : `Ativar comissão de ${target.name}`
                            }
                            disabled={busyId === rule.id}
                            onClick={() => void onToggle(rule)}
                          >
                            {rule.active ? <Ban size={15} strokeWidth={2} /> : <CheckCircle2 size={15} strokeWidth={2} />}
                          </button>
                          <button
                            type="button"
                            className="hub-dayboard__action-btn hub-dayboard__action-btn--danger"
                            title="Remover"
                            aria-label={`Remover comissão de ${target.name}`}
                            disabled={busyId === rule.id}
                            onClick={() => void onDelete(rule)}
                          >
                            <Trash2 size={15} strokeWidth={2} />
                          </button>
                        </div>
                      ) : (
                        <span className="hub-clientes__muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="hub-commissions__preview">
        <h3 className="hub-finance-page__subsection-title">Simular em uma cobrança</h3>
        <p className="hub-clientes__subtitle">
          Simulação com regras ativas. Em vendas reais, a comissão fica gravada na linha no momento da cobrança.
        </p>
        <div className="hub-finance-page__form-card">
          <div className="hub-commissions__preview-row">
            <div className="hub-clientes__field hub-commissions__preview-field">
              <label className="hub-clientes__label" htmlFor="fin-comm-prev">
                Cobrança
              </label>
              <HubSearchableCombobox
                id="fin-comm-prev"
                options={receivableOptions}
                value={previewReceivableId}
                onChange={(value) => {
                  setPreviewReceivableId(value);
                  setPreview(null);
                }}
                placeholder="Escolher cobrança…"
                searchPlaceholder="Buscar tutor ou origem…"
                ariaLabel="Cobrança para simular"
                emptyResultsLabel="Nenhuma cobrança encontrada"
              />
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!previewReceivableId || previewLoading}
              onClick={() => void onPreview()}
            >
              {previewLoading ? 'Calculando…' : 'Calcular'}
            </button>
          </div>
        </div>

        {preview ? (
          <>
            <div className="hub-adjustments__facts" aria-label="Resultado da simulação">
              <div>
                <span>Comissão estimada</span>
                <strong>{formatBrl(preview.total_commission)}</strong>
              </div>
              <div>
                <span>Total da cobrança</span>
                <strong>{formatBrl(preview.receivable_final_amount)}</strong>
              </div>
            </div>
            {preview.lines.length === 0 ? (
              <p className="hub-clientes__muted">Essa cobrança não tem itens para calcular.</p>
            ) : (
              <div className="hub-clientes__table-wrap">
                <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
                  <thead>
                    <tr>
                      <th>Item da cobrança</th>
                      <th>Como calcula</th>
                      <th className="hub-finance-page__th-num">Valor do item</th>
                      <th className="hub-finance-page__th-num">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((ln) => (
                      <tr key={ln.line_id}>
                        <td>
                          <span className="hub-payables__payee">{ln.description}</span>
                        </td>
                        <td>
                          {ln.basis && ln.rate != null ? (
                            <span className="hub-payables__chip">
                              {BASIS_CHIP[ln.basis as HubCommissionBasis] ?? ln.basis} ·{' '}
                              {formatRate(ln.basis as HubCommissionBasis, ln.rate)}
                            </span>
                          ) : (
                            <span className="hub-clientes__muted">Sem regra</span>
                          )}
                        </td>
                        <td className="hub-finance-page__td-num">
                          <span className="hub-payables__amount">{formatBrl(ln.line_total)}</span>
                        </td>
                        <td className="hub-finance-page__td-num">
                          <span className="hub-payables__amount">{formatBrl(ln.commission_amount)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>

      {canWrite ? (
        <HubSidePanel
          open={panelOpen}
          onClose={closePanel}
          title={editingId ? 'Editar comissão' : 'Nova comissão'}
          titleIcon={<Scale size={20} strokeWidth={1.75} aria-hidden />}
          subtitle={
            editingId
              ? 'Atualiza a regra deste alvo. Salvar de novo no mesmo serviço ou produto substitui a anterior.'
              : 'Uma regra por serviço ou produto. A comissão é calculada em cada item correspondente na cobrança.'
          }
          contentKey={editingId ?? 'create'}
          footer={
            <div className="hub-finance-page__drawer-footer">
              <HubCancelButton onClick={closePanel} disabled={saving} />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={saving}
                onClick={() => void onSave()}
              >
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar regra'}
              </button>
            </div>
          }
        >
          <div className="hub-finance-page__form-grid hub-commissions__panel">
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <span className="hub-clientes__label" id="fin-comm-target-kind-label">
                Tipo de alvo
              </span>
              <div
                className="hub-payables__filters"
                role="radiogroup"
                aria-labelledby="fin-comm-target-kind-label"
              >
                {(
                  [
                    { id: 'service' as const, label: 'Serviço' },
                    { id: 'product' as const, label: 'Produto' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={targetKind === opt.id}
                    className={`hub-dayboard__toggle-btn${targetKind === opt.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
                    disabled={!!editingId}
                    onClick={() => {
                      if (editingId) return;
                      setTargetKind(opt.id);
                      setTargetId('');
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-target">
                {targetKind === 'product' ? 'Produto' : 'Tipo de serviço'}
              </label>
              <HubSearchableCombobox
                id="fin-comm-target"
                options={targetKind === 'product' ? productOptions : serviceOptions}
                value={targetId}
                onChange={setTargetId}
                placeholder={targetKind === 'product' ? 'Escolher produto…' : 'Escolher serviço…'}
                searchPlaceholder={
                  targetKind === 'product' ? 'Buscar produto ou SKU…' : 'Buscar serviço ou setor…'
                }
                ariaLabel={targetKind === 'product' ? 'Produto' : 'Tipo de serviço'}
                clearable={false}
                disabled={!!editingId}
              />
              <p className="hub-clientes__muted hub-payables__field-hint">
                {targetKind === 'product'
                  ? selectedProduct
                    ? selectedProduct.store_sku
                      ? `SKU: ${selectedProduct.store_sku}`
                      : 'Produto do estoque'
                    : 'Ex.: ração, shampoo — cada um pode ter a própria regra.'
                  : selectedService
                    ? `Setor: ${serviceGroupLabel(selectedService.service_group)}`
                    : 'Ex.: Banho, Tosa, Consulta — cada um pode ter a própria regra.'}
              </p>
            </div>

            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <span className="hub-clientes__label" id="fin-comm-basis-label">
                Como calcula
              </span>
              <div
                className="hub-commissions__basis"
                role="radiogroup"
                aria-labelledby="fin-comm-basis-label"
              >
                {(
                  [
                    {
                      id: 'percent_of_sale' as const,
                      label: '% do item',
                      hint: 'Ex.: 10% de um Banho de R$ 80 = R$ 8',
                      Icon: Percent,
                    },
                    {
                      id: 'fixed_per_sale' as const,
                      label: 'Valor fixo por item',
                      hint: 'Ex.: R$ 5 toda vez que o item aparecer',
                      Icon: Wallet,
                    },
                  ] as const
                ).map((opt) => {
                  const selected = basis === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`hub-commissions__basis-option${selected ? ' hub-commissions__basis-option--selected' : ''}`}
                      onClick={() => setBasis(opt.id)}
                    >
                      <span className="hub-commissions__basis-icon" aria-hidden>
                        <opt.Icon size={16} strokeWidth={2} />
                      </span>
                      <span className="hub-commissions__basis-copy">
                        <span className="hub-commissions__basis-title">{opt.label}</span>
                        <span className="hub-commissions__basis-hint">{opt.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-rate">
                {basis === 'percent_of_sale' ? 'Porcentagem' : 'Valor fixo (R$)'}
              </label>
              <input
                id="fin-comm-rate"
                className="hub-clientes__input"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder={basis === 'percent_of_sale' ? '10' : '5,00'}
              />
              <p className="hub-clientes__muted hub-payables__field-hint">{BASIS_HELP[basis]}</p>
            </div>

            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-notes">
                Nota (opcional)
              </label>
              <input
                id="fin-comm-notes"
                className="hub-clientes__input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: comissão do groomer"
              />
            </div>

            <div className="hub-commissions__example hub-finance-page__field-span-6" aria-live="polite">
              <div className="hub-commissions__example-label">Exemplo rápido</div>
              <p className="hub-commissions__example-text">
                Item de {formatBrl(EXAMPLE_ITEM_AMOUNT)}
                {selectedService
                  ? ` (${selectedService.name})`
                  : selectedProduct
                    ? ` (${selectedProduct.name})`
                    : ''}
                {exampleCommission != null && rateValue != null ? (
                  <>
                    {' '}
                    com {formatRate(basis, rateValue)} → comissão{' '}
                    <strong>{formatBrl(exampleCommission)}</strong>
                  </>
                ) : (
                  <> — informe a taxa para ver o valor.</>
                )}
              </p>
            </div>
          </div>
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default HubCommissionsSection;
