import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle, LayoutDashboard, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  type HubFinanceReceivable,
  type HubFinanceExpense,
  type HubFinanceExpenseCategory,
  type HubFinanceCashFlowDay,
  type HubFinanceDashboardSummary,
  type HubCommissionRule,
  type HubCommissionBasis,
  type HubCommissionPreviewResponse,
} from '../../api/hubFinancialApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import HubCancellationAdjustmentsPanel from './HubCancellationAdjustmentsPanel';
import HubPaymentReversalPanel from './HubPaymentReversalPanel';
import { FinanceDayBoardSection } from './FinanceDayBoardSection';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function formatCommissionRate(basis: HubCommissionBasis, rate: number): string {
  if (basis === 'percent_of_sale') return `${rate}%`;
  return formatBrl(rate);
}

function commissionRuleServiceLabel(rule: HubCommissionRule, types: HubServiceType[]): string {
  const emb = embedOne(rule.hub_service_types);
  if (emb) return `${emb.name} (${emb.code})`;
  const t = types.find((x) => x.id === rule.hub_service_type_id);
  return t ? `${t.name} (${t.code})` : `${rule.hub_service_type_id.slice(0, 8)}…`;
}

const COMMISSION_BASIS_LABELS: Record<HubCommissionBasis, string> = {
  percent_of_sale: '% sobre valor da linha',
  fixed_per_sale: 'Valor fixo por linha (até ao total da linha)',
};

const EXPENSE_CATEGORY_LABELS: Record<HubFinanceExpenseCategory, string> = {
  supplies: 'Material / consumíveis',
  services: 'Serviços terceiros',
  utilities: 'Utilidades',
  payroll: 'Pessoal',
  rent: 'Aluguel',
  marketing: 'Marketing',
  other: 'Outro',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
};

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

function sourceLabel(type: string): string {
  return SOURCE_TYPE_LABELS[type] ?? type;
}

function statusLabel(status: string): string {
  return RECEIVABLE_STATUS_LABELS[status] ?? status;
}

type FinanceTab = 'receivables' | 'expenses' | 'cashflow' | 'commissions' | 'adjustments';

const VALID_FINANCE_TABS = new Set<FinanceTab>(['receivables', 'expenses', 'cashflow', 'commissions', 'adjustments']);

function tabFromSearchParams(params: URLSearchParams): FinanceTab {
  const raw = params.get('tab');
  if (raw && VALID_FINANCE_TABS.has(raw as FinanceTab)) return raw as FinanceTab;
  return 'receivables';
}

const HubFinanceiroPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const [tab, setTab] = useState<FinanceTab>(() => tabFromSearchParams(searchParams));
  const [cancellationPendingCount, setCancellationPendingCount] = useState(0);
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [expenses, setExpenses] = useState<HubFinanceExpense[]>([]);
  const [flowDays, setFlowDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [flowPeriod, setFlowPeriod] = useState<{ from: string; to: string } | null>(null);
  const [expLoading, setExpLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(false);

  const [expCategory, setExpCategory] = useState<HubFinanceExpenseCategory>('other');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expListFrom, setExpListFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [expListTo, setExpListTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [commissionRules, setCommissionRules] = useState<HubCommissionRule[]>([]);
  const [commissionServiceTypes, setCommissionServiceTypes] = useState<HubServiceType[]>([]);
  const [commPreviewReceivables, setCommPreviewReceivables] = useState<HubFinanceReceivable[]>([]);
  const [commLoading, setCommLoading] = useState(false);
  const [commSvcId, setCommSvcId] = useState('');
  const [commBasis, setCommBasis] = useState<HubCommissionBasis>('percent_of_sale');
  const [commRate, setCommRate] = useState('10');
  const [commNotes, setCommNotes] = useState('');
  const [previewReceivableId, setPreviewReceivableId] = useState('');
  const [commPreview, setCommPreview] = useState<HubCommissionPreviewResponse | null>(null);
  const [commPreviewLoading, setCommPreviewLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setSummaryLoading(true);
    try {
      const s = await hubFinancialApi.getDashboardSummary(clinicId, unitId, { days: 30 });
      setSummary(s);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar resumo financeiro');
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [clinicId, unitId, showError]);

  const loadCancellationCount = useCallback(async () => {
    if (!clinicId || !unitId) {
      setCancellationPendingCount(0);
      return;
    }
    try {
      const res = await hubComandaApi.getCancellationPendingCount(clinicId, unitId);
      setCancellationPendingCount(res.count ?? 0);
    } catch {
      setCancellationPendingCount(0);
    }
  }, [clinicId, unitId]);

  useEffect(() => {
    setTab(tabFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    if (!clinicId || !unitId) return;
    const rid = searchParams.get('receivable_id');
    const st = searchParams.get('source_type');
    const sid = searchParams.get('source_id');
    if (!rid && !(st && sid)) return;
    void (async () => {
      try {
        if (rid) {
          const d = await hubFinancialApi.getReceivableDetail(rid, clinicId);
          if (d.comanda_id) {
            navigate(`/hub/financeiro/comanda/${d.comanda_id}?receivable_id=${rid}`, { replace: true });
          }
          return;
        }
        if (st && sid) {
          const d = await hubComandaApi.getComandaByOrigin({
            clinic_id: clinicId,
            origin_type: st as 'appointment' | 'grooming_session' | 'encounter' | 'quote' | 'boarding_reservation',
            origin_id: sid,
          });
          const comandaId = (d.comanda as { id?: string }).id;
          if (comandaId) {
            navigate(`/hub/financeiro/comanda/${comandaId}`, { replace: true });
          }
        }
      } catch {
        /* deep link opcional — permanece na listagem */
      }
    })();
  }, [clinicId, unitId, searchParams, navigate]);

  const handleCancellationCountChange = useCallback(
    (count: number) => {
      setCancellationPendingCount(count);
      void loadSummary();
    },
    [loadSummary],
  );

  const loadExpenses = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setExpLoading(true);
    try {
      const list = await hubFinancialApi.listExpenses(clinicId, unitId, {
        from: expListFrom,
        to: expListTo,
      });
      setExpenses(list);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar despesas');
    } finally {
      setExpLoading(false);
    }
  }, [clinicId, unitId, showError, expListFrom, expListTo]);

  const loadCashFlow = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setFlowLoading(true);
    try {
      const res = await hubFinancialApi.getCashFlow(clinicId, unitId, { days: 30 });
      setFlowDays(res.days);
      setFlowPeriod(res.period);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar fluxo de caixa');
    } finally {
      setFlowLoading(false);
    }
  }, [clinicId, unitId, showError]);

  const loadCommissions = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setCommLoading(true);
    try {
      const [rules, stRes, rec] = await Promise.all([
        hubFinancialApi.listCommissionRules(clinicId, { includeInactive: true }),
        hubServiceTypesApi.list(clinicId, false, true),
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId }),
      ]);
      setCommissionRules(rules);
      const types = stRes.service_types ?? [];
      setCommissionServiceTypes(types);
      setCommPreviewReceivables(rec.slice(0, 80));
      setCommSvcId((prev) => {
        if (prev && types.some((t) => t.id === prev)) return prev;
        const first = types.find((s) => s.active && !s.deleted_at);
        return first?.id ?? '';
      });
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar comissões');
    } finally {
      setCommLoading(false);
    }
  }, [clinicId, unitId, showError]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    void loadSummary();
    void loadCancellationCount();
    if (tab === 'expenses') void loadExpenses();
    if (tab === 'cashflow') void loadCashFlow();
    if (tab === 'commissions') void loadCommissions();
  }, [permLoading, hasPermission, clinicId, unitId, tab, loadSummary, loadCancellationCount, loadExpenses, loadCashFlow, loadCommissions]);

  const switchTab = useCallback(
    (next: FinanceTab) => {
      setTab(next);
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'receivables') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams],
  );

  const onCreateExpense = async () => {
    if (!clinicId || !unitId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para registrar despesas.');
      return;
    }
    const v = Number(String(expAmount).replace(',', '.'));
    if (!expDesc.trim() || Number.isNaN(v) || v <= 0) {
      showError('Preencha descrição e valor válidos.');
      return;
    }
    try {
      await hubFinancialApi.createExpense({
        clinic_id: clinicId,
        unit_id: unitId,
        amount: v,
        category: expCategory,
        description: expDesc.trim(),
        expense_date: expDate,
      });
      showSuccess('Despesa registrada.');
      setExpDesc('');
      setExpAmount('');
      await Promise.all([loadExpenses(), loadSummary()]);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar');
    }
  };

  const summaryNet = summary?.net_operational_period ?? 0;

  const onUpsertCommissionRule = async () => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para alterar regras de comissão.');
      return;
    }
    if (!commSvcId) {
      showError('Escolha um tipo de serviço.');
      return;
    }
    const rate = Number(String(commRate).replace(',', '.'));
    if (Number.isNaN(rate) || rate < 0) {
      showError('Indique uma taxa válida.');
      return;
    }
    if (commBasis === 'percent_of_sale' && rate > 100) {
      showError('Percentagem não pode exceder 100.');
      return;
    }
    try {
      await hubFinancialApi.upsertCommissionRule({
        clinic_id: clinicId,
        hub_service_type_id: commSvcId,
        basis: commBasis,
        rate,
        notes: commNotes.trim() || null,
      });
      showSuccess('Regra guardada.');
      setCommNotes('');
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao guardar regra');
    }
  };

  const onToggleCommissionRule = async (rule: HubCommissionRule) => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão.');
      return;
    }
    try {
      await hubFinancialApi.patchCommissionRule(rule.id, {
        clinic_id: clinicId,
        active: !rule.active,
      });
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao atualizar');
    }
  };

  const onDeleteCommissionRule = async (ruleId: string) => {
    if (!clinicId) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão.');
      return;
    }
    if (!window.confirm('Remover esta regra de comissão?')) return;
    try {
      await hubFinancialApi.deleteCommissionRule(ruleId, clinicId);
      showSuccess('Regra removida.');
      setCommPreview(null);
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao remover');
    }
  };

  const onRunCommissionPreview = async () => {
    if (!clinicId || !previewReceivableId) {
      showError('Selecione um recebível para pré-visualizar.');
      return;
    }
    setCommPreviewLoading(true);
    try {
      const p = await hubFinancialApi.getCommissionPreview(clinicId, previewReceivableId);
      setCommPreview(p);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao calcular pré-visualização');
      setCommPreview(null);
    } finally {
      setCommPreviewLoading(false);
    }
  };

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  const shell = (children: React.ReactNode, panel?: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page">
      <div className="hub-clientes__main">{children}</div>
      {panel}
    </div>
  );

  if (!clinicId || !unitId) {
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>);
  }

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Financeiro</h1>
        <p className="hub-clientes__subtitle">
          Atendimentos, despesas, fluxo de caixa, comissões, estornos e ajustes por cancelamento (unidade selecionada).
        </p>
      </div>

      <HubTabs
        ariaLabel="Seções financeiras"
        items={[
          { id: 'receivables', label: 'Atendimentos' },
          { id: 'adjustments', label: 'Ajustes' },
          { id: 'expenses', label: 'Despesas' },
          { id: 'cashflow', label: 'Fluxo de caixa' },
          { id: 'commissions', label: 'Comissões' },
        ]}
        activeId={tab}
        onTabChange={(id) => switchTab(id as FinanceTab)}
      />

      <div className="hub-servicos__metrics" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pendentes de cobrança</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : String(summary?.pending_billing_count ?? 0)}</div>
            <div className="hub-servicos__metric-sub">Cobrar ou editar na aba Atendimentos</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recebíveis em aberto</div>
            <div className="hub-servicos__metric-value">
              {summaryLoading ? '—' : String(summary?.receivables_pending_count ?? summary?.receivables_open_count ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">
              {summaryLoading ? '—' : `${formatBrl(summary?.receivables_outstanding ?? 0)} a receber`}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pagamentos (30 dias)</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : formatBrl(summary?.payments_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <TrendingUp size={22} strokeWidth={1.75} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Despesas (30 dias)</div>
            <div className="hub-servicos__metric-value">{summaryLoading ? '—' : formatBrl(summary?.expenses_total_period ?? 0)}</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <TrendingDown size={22} strokeWidth={1.75} />
          </div>
        </div>
        <button
          type="button"
          className="hub-servicos__metric-card hub-servicos__metric-card--clickable"
          onClick={() => switchTab('adjustments')}
          style={{ textAlign: 'left', cursor: 'pointer', border: 'none', background: 'inherit' }}
        >
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Cancelamentos pendentes</div>
            <div className="hub-servicos__metric-value">{String(cancellationPendingCount)}</div>
            <div className="hub-servicos__metric-sub">Resolver em Ajustes</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <AlertCircle size={22} strokeWidth={1.75} />
          </div>
        </button>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saldo operacional</div>
            <div className="hub-servicos__metric-value" style={{ color: summaryNet >= 0 ? '#15803d' : '#b91c1c' }}>
              {summaryLoading ? '—' : formatBrl(summaryNet)}
            </div>
            <div className="hub-servicos__metric-sub">Pagamentos menos despesas</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <LayoutDashboard size={22} strokeWidth={1.75} />
          </div>
        </div>
      </div>

      {tab === 'receivables' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Atendimentos</h2>
          <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
            Comandas enviadas pelo caixa e cobranças pendentes ou parciais desta unidade.
          </p>
          <FinanceDayBoardSection
            clinicId={clinicId}
            unitId={unitId}
            canCreateReceivable={hasPermission('hub.receivables.create')}
            canFinancialWrite={hasPermission('hub.financial.write')}
            onLoaded={() => void loadSummary()}
          />
        </section>
      ) : null}

      {tab === 'expenses' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Despesas</h2>
          {hasPermission('hub.financial.write') ? (
            <div className="hub-finance-page__expense-toolbar">
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-cat">
                  Categoria
                </label>
                <select
                  id="fin-exp-cat"
                  className="hub-clientes__select-input"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as HubFinanceExpenseCategory)}
                >
                  {(Object.keys(EXPENSE_CATEGORY_LABELS) as HubFinanceExpenseCategory[]).map((k) => (
                    <option key={k} value={k}>
                      {EXPENSE_CATEGORY_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="fin-exp-desc">
                  Descrição
                </label>
                <input
                  id="fin-exp-desc"
                  className="hub-clientes__input"
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Ex.: Compra de shampoo"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-amt">
                  Valor (R$)
                </label>
                <input
                  id="fin-exp-amt"
                  className="hub-clientes__input"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="fin-exp-date">
                  Data
                </label>
                <input
                  id="fin-exp-date"
                  className="hub-clientes__input"
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                onClick={() => void onCreateExpense()}
              >
                Registrar despesa
              </button>
            </div>
          ) : (
            <p className="hub-clientes__muted">Apenas leitura — sem permissão para registrar despesas.</p>
          )}
          <div className="hub-clientes__toolbar" style={{ marginTop: 16, marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="fin-exp-list-from">
                Listar de
              </label>
              <input
                id="fin-exp-list-from"
                className="hub-clientes__input"
                type="date"
                value={expListFrom}
                onChange={(e) => setExpListFrom(e.target.value)}
              />
            </div>
            <div className="hub-clientes__field hub-finance-page__field-compact">
              <label className="hub-clientes__label" htmlFor="fin-exp-list-to">
                até
              </label>
              <input
                id="fin-exp-list-to"
                className="hub-clientes__input"
                type="date"
                value={expListTo}
                onChange={(e) => setExpListTo(e.target.value)}
              />
            </div>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => void loadExpenses()}>
              Atualizar lista
            </button>
          </div>
          {expLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : expenses.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma despesa nesta unidade.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Categoria</th>
                    <th>Descrição</th>
                    <th className="hub-finance-page__th-num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((ex) => (
                    <tr key={ex.id}>
                      <td>{ex.expense_date}</td>
                      <td>{EXPENSE_CATEGORY_LABELS[ex.category] ?? ex.category}</td>
                      <td>{ex.description}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(ex.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'cashflow' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Fluxo de caixa (diário)</h2>
          <p className="hub-clientes__subtitle" style={{ marginBottom: 16 }}>
            {flowPeriod ? `Período: ${flowPeriod.from} — ${flowPeriod.to}. ` : ''}
            Entradas: pagamentos de recebíveis desta unidade e suprimentos no caixa. Saídas: despesas e sangrias.
          </p>
          {flowLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : flowDays.length === 0 ? (
            <p className="hub-clientes__muted">Sem dados no intervalo.</p>
          ) : (
            <div className="hub-clientes__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="hub-finance-page__th-num">Pagamentos</th>
                    <th className="hub-finance-page__th-num">Suprimentos</th>
                    <th className="hub-finance-page__th-num">Despesas</th>
                    <th className="hub-finance-page__th-num">Sangrias</th>
                    <th className="hub-finance-page__th-num">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {flowDays.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.payments_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.deposits_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.expenses_out)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.withdrawals_out)}</td>
                      <td
                        className={`hub-finance-page__td-num ${
                          d.net >= 0 ? 'hub-finance-page__td-num--pos' : 'hub-finance-page__td-num--neg'
                        }`}
                      >
                        {formatBrl(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'adjustments' ? (
        <>
          <HubCancellationAdjustmentsPanel onCountChange={handleCancellationCountChange} />
          <HubPaymentReversalPanel />
        </>
      ) : null}

      {tab === 'commissions' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Comissões por tipo de serviço</h2>
          <p className="hub-clientes__subtitle" style={{ marginBottom: 16 }}>
            Defina percentagem sobre o valor da linha do recebível ou valor fixo por linha (limitado ao total da linha).
            Salvar com o mesmo tipo de serviço atualiza a regra existente.
          </p>
          {commLoading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : (
            <>
              {hasPermission('hub.financial.write') ? (
                <div className="hub-finance-page__expense-toolbar" style={{ marginBottom: 20 }}>
                  <div className="hub-clientes__field hub-finance-page__field-grow">
                    <label className="hub-clientes__label" htmlFor="fin-comm-svc">
                      Tipo de serviço
                    </label>
                    <select
                      id="fin-comm-svc"
                      className="hub-clientes__select-input"
                      value={commSvcId}
                      onChange={(e) => setCommSvcId(e.target.value)}
                    >
                      <option value="">—</option>
                      {commissionServiceTypes
                        .filter((s) => s.active && !s.deleted_at)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-compact">
                    <label className="hub-clientes__label" htmlFor="fin-comm-basis">
                      Critério
                    </label>
                    <select
                      id="fin-comm-basis"
                      className="hub-clientes__select-input"
                      value={commBasis}
                      onChange={(e) => setCommBasis(e.target.value as HubCommissionBasis)}
                    >
                      {(Object.keys(COMMISSION_BASIS_LABELS) as HubCommissionBasis[]).map((k) => (
                        <option key={k} value={k}>
                          {COMMISSION_BASIS_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-compact">
                    <label className="hub-clientes__label" htmlFor="fin-comm-rate">
                      {commBasis === 'percent_of_sale' ? 'Taxa (%)' : 'Valor (R$)'}
                    </label>
                    <input
                      id="fin-comm-rate"
                      className="hub-clientes__input"
                      value={commRate}
                      onChange={(e) => setCommRate(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="hub-clientes__field hub-finance-page__field-grow">
                    <label className="hub-clientes__label" htmlFor="fin-comm-notes">
                      Notas (opcional)
                    </label>
                    <input
                      id="fin-comm-notes"
                      className="hub-clientes__input"
                      value={commNotes}
                      onChange={(e) => setCommNotes(e.target.value)}
                      placeholder="Ex.: comissão groomer"
                    />
                  </div>
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                    onClick={() => void onUpsertCommissionRule()}
                  >
                    Salvar regra
                  </button>
                </div>
              ) : (
                <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
                  Apenas leitura — sem permissão para alterar regras.
                </p>
              )}

              <h3 className="hub-clientes__form-title" style={{ fontSize: '1rem', marginBottom: 8 }}>
                Regras
              </h3>
              {commissionRules.length === 0 ? (
                <p className="hub-clientes__muted">Nenhuma regra definida para esta clínica.</p>
              ) : (
                <div className="hub-clientes__table-wrap">
                  <table className="hub-clientes__table hub-finance-page__table">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>Critério</th>
                        <th className="hub-finance-page__th-num">Taxa</th>
                        <th>Ativa</th>
                        {hasPermission('hub.financial.write') ? <th /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {commissionRules.map((r) => (
                        <tr key={r.id} className={!r.active ? 'hub-clientes__muted' : undefined}>
                          <td>{commissionRuleServiceLabel(r, commissionServiceTypes)}</td>
                          <td>{COMMISSION_BASIS_LABELS[r.basis] ?? r.basis}</td>
                          <td className="hub-finance-page__td-num">{formatCommissionRate(r.basis, Number(r.rate))}</td>
                          <td>{r.active ? 'Sim' : 'Não'}</td>
                          {hasPermission('hub.financial.write') ? (
                            <td>
                              <button
                                type="button"
                                className="hub-clientes__btn hub-clientes__btn--ghost"
                                style={{ marginRight: 8 }}
                                onClick={() => void onToggleCommissionRule(r)}
                              >
                                {r.active ? 'Desativar' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                className="hub-clientes__btn hub-clientes__btn--ghost"
                                onClick={() => void onDeleteCommissionRule(r.id)}
                              >
                                Remover
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="hub-clientes__form-title" style={{ fontSize: '1rem', marginTop: 24, marginBottom: 8 }}>
                Pré-visualização por recebível
              </h3>
              <p className="hub-clientes__subtitle" style={{ marginBottom: 12 }}>
                Usa as linhas do recebível e as regras <strong>ativas</strong> desta clínica (até 80 recebíveis recentes
                desta unidade).
              </p>
              <div className="hub-finance-page__expense-toolbar" style={{ marginBottom: 16 }}>
                <div className="hub-clientes__field hub-finance-page__field-grow">
                  <label className="hub-clientes__label" htmlFor="fin-comm-prev-rec">
                    Recebível
                  </label>
                  <select
                    id="fin-comm-prev-rec"
                    className="hub-clientes__select-input"
                    value={previewReceivableId}
                    onChange={(e) => {
                      setPreviewReceivableId(e.target.value);
                      setCommPreview(null);
                    }}
                  >
                    <option value="">—</option>
                    {commPreviewReceivables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {statusLabel(r.status)} · {formatBrl(Number(r.final_amount))} · {sourceLabel(r.source_type)}{' '}
                        ({r.source_id.slice(0, 8)}…)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align"
                  disabled={!previewReceivableId || commPreviewLoading}
                  onClick={() => void onRunCommissionPreview()}
                >
                  {commPreviewLoading ? 'Calculando…' : 'Calcular'}
                </button>
              </div>
              {commPreview ? (
                <>
                  <p className="hub-clientes__subtitle" style={{ marginBottom: 8 }}>
                    Total comissão estimada:{' '}
                    <strong>{formatBrl(commPreview.total_commission)}</strong> (recebível final{' '}
                    {formatBrl(commPreview.receivable_final_amount)})
                  </p>
                  <div className="hub-clientes__table-wrap">
                    <table className="hub-clientes__table hub-finance-page__table">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th className="hub-finance-page__th-num">Linha</th>
                          <th>Critério</th>
                          <th className="hub-finance-page__th-num">Comissão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commPreview.lines.map((ln) => (
                          <tr key={ln.line_id}>
                            <td>{ln.description}</td>
                            <td className="hub-finance-page__td-num">{formatBrl(ln.line_total)}</td>
                            <td>
                              {ln.basis && ln.rate != null
                                ? `${COMMISSION_BASIS_LABELS[ln.basis as HubCommissionBasis] ?? ln.basis} (${formatCommissionRate(ln.basis as HubCommissionBasis, ln.rate)})`
                                : '—'}
                            </td>
                            <td className="hub-finance-page__td-num">{formatBrl(ln.commission_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

    </>
  );
};

export default HubFinanceiroPage;
