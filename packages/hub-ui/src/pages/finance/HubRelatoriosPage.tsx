import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import {
  hubFinancialApi,
  type HubFinanceAgingReport,
  type HubFinanceRevenueReport,
  type HubFinanceTicketAverageReport,
  type HubFinanceTopServicesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const AGING_LABELS: Record<string, string> = {
  no_due_date: 'Sem vencimento',
  not_due: 'A vencer',
  overdue_1_30: 'Vencidos 1-30 dias',
  overdue_31_60: 'Vencidos 31-60 dias',
  overdue_61_plus: 'Vencidos 61+ dias',
};

const HubRelatoriosPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState<HubFinanceRevenueReport | null>(null);
  const [ticket, setTicket] = useState<HubFinanceTicketAverageReport | null>(null);
  const [topServices, setTopServices] = useState<HubFinanceTopServicesReport | null>(null);
  const [aging, setAging] = useState<HubFinanceAgingReport | null>(null);

  const loadReports = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setLoading(true);
    try {
      const [rev, tic, top] = await Promise.all([
        hubFinancialApi.getRevenueReport(clinicId, unitId, { days }),
        hubFinancialApi.getTicketAverageReport(clinicId, unitId, { days }),
        hubFinancialApi.getTopServicesReport(clinicId, unitId, { days }),
      ]);
      const ag = await hubFinancialApi.getAgingReport(clinicId, unitId, { as_of: rev.period.to });
      setRevenue(rev);
      setTicket(tic);
      setTopServices(top);
      setAging(ag);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, days, showError]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    void loadReports();
  }, [permLoading, hasPermission, loadReports]);

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  if (!clinicId || !unitId) {
    return (
      <div className="hub-clientes hub-servicos-page hub-finance-page">
        <div className="hub-clientes__main">
          <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-finance-page">
      <div className="hub-clientes__main">
        <div className="hub-clientes__title-block">
          <h1 className="hub-clientes__title">Relatórios</h1>
          <p className="hub-clientes__subtitle">
            Visão financeira mínima do MVP: faturamento, ticket médio, serviços mais vendidos e inadimplência.
          </p>
        </div>

        <div className="hub-clientes__toolbar">
          <div className="hub-servicos__filter-field">
            <span className="hub-clientes__label">Período</span>
            <select
              className="hub-clientes__select-input"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => void loadReports()}
          >
            Atualizar
          </button>
        </div>

        {loading ? <HubLoading variant="block" label="Carregando relatórios…" /> : null}

        <div className="hub-servicos__metrics" style={{ marginBottom: 24 }}>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Faturamento recebido</div>
              <div className="hub-servicos__metric-value">{formatBrl(revenue?.total ?? 0)}</div>
              <div className="hub-servicos__metric-sub">
                {revenue ? `${revenue.period.from} a ${revenue.period.to}` : 'Sem dados'}
              </div>
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Ticket médio</div>
              <div className="hub-servicos__metric-value">{formatBrl(ticket?.ticket_average ?? 0)}</div>
              <div className="hub-servicos__metric-sub">{ticket?.receivables_count ?? 0} recebíveis no período</div>
            </div>
          </div>
        </div>

        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Faturamento por forma de pagamento</h2>
          <div className="hub-finance-page__report-list">
            {Object.entries(revenue?.by_method ?? {}).length === 0 ? (
              <p className="hub-clientes__muted">Sem pagamentos recebidos no período.</p>
            ) : (
              Object.entries(revenue?.by_method ?? {}).map(([method, total]) => (
                <div key={method} className="hub-finance-page__report-row">
                  <span>{paymentMethodLabel(method)}</span>
                  <strong>{formatBrl(total)}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Serviços mais vendidos</h2>
          <div className="hub-finance-page__report-list">
            {topServices?.items.length ? (
              topServices.items.map((item) => (
                <div key={item.service_id} className="hub-finance-page__report-row">
                  <span>
                    {item.name} · {item.quantity} venda(s)
                  </span>
                  <strong>{formatBrl(item.total)}</strong>
                </div>
              ))
            ) : (
              <p className="hub-clientes__muted">Sem linhas de serviço no período.</p>
            )}
          </div>
        </section>

        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Aging de recebíveis</h2>
          <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
            Base <strong>{aging?.as_of ?? '—'}</strong> (fim do período de faturamento, alinhado ao intervalo acima).
          </p>
          <div className="hub-finance-page__report-list">
            {Object.entries(aging?.buckets ?? {}).map(([bucket, value]) => (
              <div key={bucket} className="hub-finance-page__report-row">
                <span>
                  {AGING_LABELS[bucket] ?? bucket} · {value.count}
                </span>
                <strong>{formatBrl(value.total)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default HubRelatoriosPage;
