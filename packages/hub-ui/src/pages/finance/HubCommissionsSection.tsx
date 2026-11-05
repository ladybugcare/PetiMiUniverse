import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Pencil, Plus, Scale, Search, Trash2, X } from 'lucide-react';
import {
  hubFinancialApi,
  type HubCommissionBasis,
  type HubCommissionPreviewResponse,
  type HubCommissionRule,
  type HubFinanceReceivable,
} from '../../api/hubFinancialApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { formatComandaOriginLabel } from './comandaListPreview';

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
  percent_of_sale: 'Porcentagem da linha',
  fixed_per_sale: 'Valor fixo por linha',
};

const BASIS_CHIP: Record<HubCommissionBasis, string> = {
  percent_of_sale: '% da linha',
  fixed_per_sale: 'Valor fixo',
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

function formatRate(basis: HubCommissionBasis, rate: number): string {
  if (basis === 'percent_of_sale') return `${rate}%`;
  return formatBrl(rate);
}

function serviceOf(rule: HubCommissionRule, types: HubServiceType[]) {
  const emb = embedOne(rule.hub_service_types);
  if (emb) return { name: emb.name, code: emb.code };
  const found = types.find((t) => t.id === rule.hub_service_type_id);
  if (found) return { name: found.name, code: found.code };
  return { name: 'Serviço removido', code: '' };
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
  const [receivables, setReceivables] = useState<HubFinanceReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [search, setSearch] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [svcId, setSvcId] = useState('');
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
        const [nextRules, stRes, rec] = await Promise.all([
          hubFinancialApi.listCommissionRules(clinicId, { includeInactive: true }),
          hubServiceTypesApi.list(clinicId, false, true),
          hubFinancialApi.listReceivables(clinicId, { unit_id: unitId }),
        ]);
        setRules(nextRules);
        setServiceTypes(stRes.service_types ?? []);
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
      const svc = serviceOf(rule, serviceTypes);
      const haystack = normalizeText([svc.name, svc.code, rule.notes, BASIS_LABELS[rule.basis]].filter(Boolean).join(' '));
      return haystack.includes(term);
    });
  }, [rules, activeFilter, search, serviceTypes]);

  const activeCount = rules.filter((r) => r.active).length;
  const filtersNarrowed = activeFilter !== 'active' || search.trim().length > 0;

  const serviceOptions: HubComboboxOption[] = useMemo(
    () =>
      serviceTypes
        .filter((s) => s.active && !s.deleted_at)
        .map((s) => ({ value: s.id, label: s.name, searchText: s.code })),
    [serviceTypes],
  );

  const basisOptions: HubComboboxOption[] = (Object.keys(BASIS_LABELS) as HubCommissionBasis[]).map((id) => ({
    value: id,
    label: BASIS_LABELS[id],
  }));

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

  const resetForm = () => {
    setEditingId(null);
    setSvcId('');
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
    setSvcId(rule.hub_service_type_id);
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
    if (!svcId) {
      showError('Escolha um tipo de serviço.');
      return;
    }
    const value = Number(String(rate).replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
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
        hub_service_type_id: svcId,
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
    const svc = serviceOf(rule, serviceTypes);
    if (!window.confirm(`Remover a comissão de "${svc.name}"?`)) return;
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
            Uma regra por tipo de serviço. A porcentagem incide sobre a linha da cobrança; o valor fixo não passa do
            total da linha. Só regras ativas entram na simulação.
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
              placeholder="Buscar serviço…"
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
              : 'Cadastre a comissão de cada serviço para simular o valor em uma cobrança.'}
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
                <th>Serviço</th>
                <th>Critério</th>
                <th className="hub-finance-page__th-num">Taxa</th>
                <th>Situação</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((rule) => {
                const svc = serviceOf(rule, serviceTypes);
                return (
                  <tr key={rule.id} className={editingId === rule.id ? 'hub-payables__row--active' : undefined}>
                    <td>
                      <span className="hub-payables__payee">{svc.name}</span>
                      {rule.notes ? <span className="hub-expenses__notes">{rule.notes}</span> : svc.code ? (
                        <span className="hub-expenses__notes">{svc.code}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className="hub-payables__chip">{BASIS_CHIP[rule.basis] ?? rule.basis}</span>
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
                            aria-label={`Editar comissão de ${svc.name}`}
                            disabled={busyId === rule.id}
                            onClick={() => openEdit(rule)}
                          >
                            <Pencil size={15} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title={rule.active ? 'Desativar' : 'Ativar'}
                            aria-label={rule.active ? `Desativar comissão de ${svc.name}` : `Ativar comissão de ${svc.name}`}
                            disabled={busyId === rule.id}
                            onClick={() => void onToggle(rule)}
                          >
                            {rule.active ? <Ban size={15} strokeWidth={2} /> : <CheckCircle2 size={15} strokeWidth={2} />}
                          </button>
                          <button
                            type="button"
                            className="hub-dayboard__action-btn hub-dayboard__action-btn--danger"
                            title="Remover"
                            aria-label={`Remover comissão de ${svc.name}`}
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
          Estima a comissão com as regras ativas e as linhas das cobranças recentes desta unidade.
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
                <span>Valor da cobrança</span>
                <strong>{formatBrl(preview.receivable_final_amount)}</strong>
              </div>
            </div>
            {preview.lines.length === 0 ? (
              <p className="hub-clientes__muted">Essa cobrança não tem linhas para calcular.</p>
            ) : (
              <div className="hub-clientes__table-wrap">
                <table className="hub-clientes__table hub-dayboard__table hub-payables__table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Critério</th>
                      <th className="hub-finance-page__th-num">Valor</th>
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
              ? 'Atualiza a regra deste serviço. Salvar de novo no mesmo serviço substitui a anterior.'
              : 'Define quanto a equipe recebe sobre cada linha desse serviço.'
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
          <div className="hub-finance-page__form-grid">
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-svc">
                Tipo de serviço
              </label>
              <HubSearchableCombobox
                id="fin-comm-svc"
                options={serviceOptions}
                value={svcId}
                onChange={setSvcId}
                placeholder="Escolher serviço…"
                searchPlaceholder="Buscar serviço…"
                ariaLabel="Tipo de serviço"
                clearable={false}
                disabled={!!editingId}
              />
            </div>
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-basis">
                Critério
              </label>
              <HubSearchableCombobox
                id="fin-comm-basis"
                options={basisOptions}
                value={basis}
                onChange={(value) => setBasis((value || basis) as HubCommissionBasis)}
                placeholder="Escolher critério…"
                searchPlaceholder="Buscar critério…"
                ariaLabel="Critério da comissão"
                clearable={false}
              />
            </div>
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-rate">
                {basis === 'percent_of_sale' ? 'Porcentagem' : 'Valor (R$)'}
              </label>
              <input
                id="fin-comm-rate"
                className="hub-clientes__input"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                placeholder={basis === 'percent_of_sale' ? '10' : '0,00'}
              />
            </div>
            <div className="hub-clientes__field hub-finance-page__field-span-6">
              <label className="hub-clientes__label" htmlFor="fin-comm-notes">
                Nota
              </label>
              <input
                id="fin-comm-notes"
                className="hub-clientes__input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: comissão do groomer"
              />
            </div>
          </div>
        </HubSidePanel>
      ) : null}
    </section>
  );
};

export default HubCommissionsSection;
