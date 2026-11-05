import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { Scale, TrendingUp } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  type HubFinanceReceivable,
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
import HubExpensesSection from './HubExpensesSection';
import HubPayablesSection from './HubPayablesSection';
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
  fixed_per_sale: 'Valor fixo por linha (até o total da linha)',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
  boarding_reservation: 'Hotel & Creche',
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

type FinanceTab = 'receivables' | 'expenses' | 'payables' | 'cashflow' | 'commissions' | 'adjustments';

const VALID_FINANCE_TABS = new Set<FinanceTab>([
  'receivables',
  'expenses',
  'payables',
  'cashflow',
  'commissions',
  'adjustments',
]);

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
  const [flowDays, setFlowDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [flowPeriod, setFlowPeriod] = useState<{ from: string; to: string } | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);

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
    if (tab === 'cashflow') void loadCashFlow();
    if (tab === 'commissions') void loadCommissions();
  }, [permLoading, hasPermission, clinicId, unitId, tab, loadSummary, loadCancellationCount, loadCashFlow, loadCommissions]);

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
      showError('Porcentagem não pode exceder 100.');
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
      showSuccess('Regra salva.');
      setCommNotes('');
      await loadCommissions();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao salvar regra');
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
      <div className="hub-finance-page__topbar">
        <div
          className="hub-finance-page__summary"
          aria-live="polite"
          aria-label="Resumo financeiro dos últimos 30 dias"
        >
          <button
            type="button"
            className="hub-finance-page__summary-item"
            onClick={() => switchTab('receivables')}
          >
            <span className="hub-finance-page__summary-label">A receber</span>
            <span className="hub-finance-page__summary-value">
              {summaryLoading ? '—' : formatBrl(summary?.receivables_outstanding ?? 0)}
            </span>
            <span className="hub-finance-page__summary-meta">
              {summaryLoading
                ? '…'
                : `${summary?.receivables_pending_count ?? summary?.receivables_open_count ?? 0} em aberto`}
              {!summaryLoading && (summary?.pending_billing_count ?? 0) > 0
                ? ` · ${summary?.pending_billing_count} sem cobrança`
                : ''}
            </span>
          </button>

          <button
            type="button"
            className="hub-finance-page__summary-item"
            onClick={() => switchTab('payables')}
          >
            <span className="hub-finance-page__summary-label">A pagar</span>
            <span className="hub-finance-page__summary-value">
              {summaryLoading ? '—' : formatBrl(summary?.payables_outstanding ?? 0)}
            </span>
            <span className="hub-finance-page__summary-meta">
              {summaryLoading
                ? '…'
                : `${summary?.payables_pending_count ?? 0} título(s)${
                    (summary?.payables_unconfirmed_count ?? 0) > 0
                      ? ` · ${summary?.payables_unconfirmed_count} a confirmar`
                      : ''
                  }`}
            </span>
          </button>

          <button
            type="button"
            className="hub-finance-page__summary-item"
            onClick={() => switchTab('cashflow')}
          >
            <span className="hub-finance-page__summary-label">Pagamentos · 30d</span>
            <span className="hub-finance-page__summary-value">
              {summaryLoading ? '—' : formatBrl(summary?.payments_total_period ?? 0)}
            </span>
            <span className="hub-finance-page__summary-meta">
              {summaryLoading
                ? '…'
                : `Despesas ${formatBrl(summary?.expenses_total_period ?? 0)}`}
            </span>
          </button>

          <button
            type="button"
            className={`hub-finance-page__summary-item hub-finance-page__summary-item--result${
              !summaryLoading && summaryNet < 0 ? ' hub-finance-page__summary-item--neg' : ''
            }`}
            onClick={() => switchTab('cashflow')}
          >
            <span className="hub-finance-page__summary-label">Saldo · 30d</span>
            <span
              className={`hub-finance-page__summary-value${
                summaryLoading
                  ? ''
                  : summaryNet >= 0
                    ? ' hub-finance-page__summary-value--pos'
                    : ' hub-finance-page__summary-value--neg'
              }`}
            >
              {summaryLoading ? '—' : formatBrl(summaryNet)}
            </span>
            <span className="hub-finance-page__summary-meta">Pagamentos − saídas</span>
          </button>

          {cancellationPendingCount > 0 ? (
            <button
              type="button"
              className="hub-finance-page__summary-item hub-finance-page__summary-item--alert"
              onClick={() => switchTab('adjustments')}
            >
              <span className="hub-finance-page__summary-label">Ajustes</span>
              <span className="hub-finance-page__summary-value">{cancellationPendingCount}</span>
              <span className="hub-finance-page__summary-meta">Cancelamento(s)</span>
            </button>
          ) : null}
        </div>
      </div>

      <HubTabs
        ariaLabel="Seções financeiras"
        items={[
          {
            id: 'receivables',
            label: 'Contas a receber',
            badge: summary?.receivables_pending_count ?? summary?.receivables_open_count ?? null,
          },
          {
            id: 'payables',
            label: 'Contas a pagar',
            badge: summary?.payables_pending_count ?? null,
          },
          { id: 'expenses', label: 'Despesas' },
          { id: 'cashflow', label: 'Fluxo de caixa' },
          {
            id: 'adjustments',
            label: 'Ajustes',
            badge: cancellationPendingCount || null,
            secondary: true,
          },
          { id: 'commissions', label: 'Comissões', secondary: true },
        ]}
        activeId={tab}
        onTabChange={(id) => switchTab(id as FinanceTab)}
      />

      {tab === 'receivables' ? (
        <section className="hub-finance-page__section">
          <div className="hub-finance-page__section-head">
            <div>
              <h2 className="hub-clientes__form-title">Contas a receber</h2>
              <p className="hub-clientes__muted">
                Lista o que ainda precisa de cobrança financeira. A coluna Atendimento é o andamento do
                serviço; a coluna Cobrança é o recebível (pendente / vencimento). Um atendimento
                &quot;Confirmado&quot; ou até &quot;Pago&quot; no operacional ainda pode ter cobrança em
                aberto.
              </p>
            </div>
          </div>
          <FinanceDayBoardSection
            clinicId={clinicId}
            unitId={unitId}
            canCreateReceivable={hasPermission('hub.receivables.create')}
            canFinancialWrite={hasPermission('hub.financial.write')}
            onLoaded={() => void loadSummary()}
          />
        </section>
      ) : null}

      {tab === 'expenses' && clinicId && unitId ? (
        <HubExpensesSection
          clinicId={clinicId}
          unitId={unitId}
          canWrite={hasPermission('hub.financial.write')}
          showError={showError}
          showSuccess={showSuccess}
          onChanged={() => void loadSummary()}
        />
      ) : null}

      {tab === 'payables' && clinicId && unitId ? (
        <HubPayablesSection
          clinicId={clinicId}
          unitId={unitId}
          canWrite={hasPermission('hub.financial.write')}
          showError={showError}
          showSuccess={showSuccess}
          onChanged={() => void loadSummary()}
        />
      ) : null}

      {tab === 'cashflow' ? (
        <section className="hub-finance-page__section">
          <div className="hub-finance-page__section-head">
            <div>
              <h2 className="hub-clientes__form-title">Fluxo de caixa (diário)</h2>
              <p className="hub-clientes__subtitle">
                {flowPeriod ? `Período: ${flowPeriod.from} — ${flowPeriod.to}. ` : ''}
                Entradas: pagamentos de recebíveis e suprimentos. Saídas: despesas, contas a pagar
                liquidadas e sangrias.
              </p>
            </div>
          </div>
          {flowLoading ? (
            <HubLoading variant="block" label="Carregando fluxo de caixa…" />
          ) : flowDays.length === 0 ? (
            <div className="hub-finance-page__empty" role="status">
              <span className="hub-finance-page__empty-icon" aria-hidden>
                <TrendingUp size={24} strokeWidth={1.75} />
              </span>
              <p className="hub-finance-page__empty-title">Sem movimentos no intervalo</p>
              <p className="hub-finance-page__empty-desc">
                O fluxo aparece quando houver pagamentos, despesas, sangrias ou suprimentos na unidade.
              </p>
            </div>
          ) : (
            <div className="hub-clientes__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="hub-finance-page__th-num">Pagamentos</th>
                    <th className="hub-finance-page__th-num">Suprimentos</th>
                    <th className="hub-finance-page__th-num">Despesas / AP</th>
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
          <div className="hub-finance-page__section-head">
            <div>
              <h2 className="hub-clientes__form-title">Comissões por tipo de serviço</h2>
              <p className="hub-clientes__subtitle">
                Defina porcentagem sobre o valor da linha do recebível ou valor fixo por linha (limitado ao
                total da linha). Salvar com o mesmo tipo de serviço atualiza a regra existente.
              </p>
            </div>
          </div>
          {commLoading ? (
            <HubLoading variant="block" label="Carregando comissões…" />
          ) : (
            <>
              {hasPermission('hub.financial.write') ? (
                <div className="hub-finance-page__form-card">
                  <h3 className="hub-finance-page__form-card-title">Nova regra ou atualização</h3>
                  <p className="hub-finance-page__form-card-sub">
                    Uma regra ativa por tipo de serviço. Inativos não entram na prévia.
                  </p>
                  <div className="hub-finance-page__form-grid">
                    <div className="hub-clientes__field hub-finance-page__field-span-4">
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
                    <div className="hub-clientes__field hub-finance-page__field-span-3">
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
                    <div className="hub-clientes__field hub-finance-page__field-span-2">
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
                    <div className="hub-clientes__field hub-finance-page__field-span-3">
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
                    <div className="hub-finance-page__form-actions">
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary"
                        onClick={() => void onUpsertCommissionRule()}
                      >
                        Salvar regra
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="hub-clientes__muted" style={{ marginBottom: 16 }}>
                  Apenas leitura — sem permissão para alterar regras.
                </p>
              )}

              <h3 className="hub-finance-page__subsection-title">Regras</h3>
              {commissionRules.length === 0 ? (
                <div className="hub-finance-page__empty" role="status">
                  <span className="hub-finance-page__empty-icon" aria-hidden>
                    <Scale size={24} strokeWidth={1.75} />
                  </span>
                  <p className="hub-finance-page__empty-title">Nenhuma regra definida</p>
                  <p className="hub-finance-page__empty-desc">
                    Cadastre uma comissão por tipo de serviço para estimar valores na prévia abaixo.
                  </p>
                </div>
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
                              <div className="hub-finance-page__row-actions">
                                <button
                                  type="button"
                                  className="hub-clientes__btn hub-clientes__btn--ghost"
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
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="hub-finance-page__subsection-title" style={{ marginTop: 24 }}>
                Prévia por recebível
              </h3>
              <p className="hub-clientes__subtitle" style={{ marginBottom: 12 }}>
                Usa as linhas do recebível e as regras <strong>ativas</strong> desta clínica (até 80
                recebíveis recentes desta unidade).
              </p>
              <div className="hub-finance-page__form-card">
                <div className="hub-finance-page__form-grid">
                  <div className="hub-clientes__field hub-finance-page__field-span-6">
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
                          {statusLabel(r.status)} · {formatBrl(Number(r.final_amount))} ·{' '}
                          {sourceLabel(r.source_type)} ({r.source_id.slice(0, 8)}…)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hub-finance-page__form-actions">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary"
                      disabled={!previewReceivableId || commPreviewLoading}
                      onClick={() => void onRunCommissionPreview()}
                    >
                      {commPreviewLoading ? 'Calculando…' : 'Calcular'}
                    </button>
                  </div>
                </div>
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
