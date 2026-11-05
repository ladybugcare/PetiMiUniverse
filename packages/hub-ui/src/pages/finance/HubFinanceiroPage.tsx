import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { TrendingUp } from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  type HubFinanceCashFlowDay,
  type HubFinanceDashboardSummary,
} from '../../api/hubFinancialApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import HubCancellationAdjustmentsPanel from './HubCancellationAdjustmentsPanel';
import HubCommissionsSection from './HubCommissionsSection';
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
  const [adjustView, setAdjustView] = useState<'cancellations' | 'reversals'>('cancellations');
  const [cancellationPendingCount, setCancellationPendingCount] = useState(0);
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [flowDays, setFlowDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [flowPeriod, setFlowPeriod] = useState<{ from: string; to: string } | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);

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

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    void loadSummary();
    void loadCancellationCount();
    if (tab === 'cashflow') void loadCashFlow();
  }, [permLoading, hasPermission, clinicId, unitId, tab, loadSummary, loadCancellationCount, loadCashFlow]);

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
              onClick={() => {
                setAdjustView('cancellations');
                switchTab('adjustments');
              }}
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
          <HubTabs
            ariaLabel="Tipos de ajuste"
            variant="detail"
            className="hub-adjustments__tabs"
            activeId={adjustView}
            onTabChange={(id) => setAdjustView(id as 'cancellations' | 'reversals')}
            items={[
              {
                id: 'cancellations',
                label: 'Cancelamentos',
                badge: cancellationPendingCount || null,
              },
              { id: 'reversals', label: 'Estornos' },
            ]}
          />
          {adjustView === 'cancellations' ? (
            <HubCancellationAdjustmentsPanel onCountChange={handleCancellationCountChange} />
          ) : (
            <HubPaymentReversalPanel />
          )}
        </>
      ) : null}

      {tab === 'commissions' && clinicId && unitId ? (
        <HubCommissionsSection
          clinicId={clinicId}
          unitId={unitId}
          canWrite={hasPermission('hub.financial.write')}
          showError={showError}
          showSuccess={showSuccess}
        />
      ) : null}

    </>
  );
};

export default HubFinanceiroPage;
