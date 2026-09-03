import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  hubFinancialApi,
  type HubFinanceAgingReport,
  type HubFinanceRevenueReport,
  type HubFinanceTicketAverageReport,
  type HubFinanceTopServicesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl } from './hubRelatoriosUtils';

const AGING_LABELS: Record<string, string> = {
  no_due_date: 'Sem vencimento',
  not_due: 'A vencer',
  overdue_1_30: 'Vencidos 1-30 dias',
  overdue_31_60: 'Vencidos 31-60 dias',
  overdue_61_plus: 'Vencidos 61+ dias',
};

const PIE_COLORS = ['#f0642f', '#0f766e', '#2563eb', '#7c3aed', '#b45309', '#be123c'];

type HubRelatoriosFinanceOverviewProps = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

export const HubRelatoriosFinanceOverview: React.FC<HubRelatoriosFinanceOverviewProps> = ({
  clinicId,
  unitId,
  period,
}) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState<HubFinanceRevenueReport | null>(null);
  const [ticket, setTicket] = useState<HubFinanceTicketAverageReport | null>(null);
  const [topServices, setTopServices] = useState<HubFinanceTopServicesReport | null>(null);
  const [aging, setAging] = useState<HubFinanceAgingReport | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const opts = periodToApiOpts(period);
      const [rev, tic, top] = await Promise.all([
        hubFinancialApi.getRevenueReport(clinicId, unitId, opts),
        hubFinancialApi.getTicketAverageReport(clinicId, unitId, opts),
        hubFinancialApi.getTopServicesReport(clinicId, unitId, opts),
      ]);
      const ag = await hubFinancialApi.getAgingReport(clinicId, unitId, { as_of: rev.period.to });
      setRevenue(rev);
      setTicket(tic);
      setTopServices(top);
      setAging(ag);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar relatório financeiro');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const methodChart = useMemo(
    () =>
      Object.entries(revenue?.by_method ?? {}).map(([method, total]) => ({
        name: paymentMethodLabel(method),
        value: total,
      })),
    [revenue]
  );

  const servicesChart = useMemo(
    () =>
      (topServices?.items ?? []).slice(0, 8).map((item) => ({
        name: item.name.length > 16 ? `${item.name.slice(0, 14)}…` : item.name,
        total: item.total,
      })),
    [topServices]
  );

  const onExport = () => {
    const rows: Array<Array<string | number | null>> = [];
    rows.push(['Seção', 'Item', 'Quantidade', 'Valor']);
    rows.push(['KPI', 'Faturamento recebido', '', revenue?.total ?? 0]);
    rows.push(['KPI', 'Ticket médio', ticket?.receivables_count ?? 0, ticket?.ticket_average ?? 0]);
    for (const [method, total] of Object.entries(revenue?.by_method ?? {})) {
      rows.push(['Forma de pagamento', paymentMethodLabel(method), '', total]);
    }
    for (const item of topServices?.items ?? []) {
      rows.push(['Serviço', item.name, item.quantity, item.total]);
    }
    for (const [bucket, value] of Object.entries(aging?.buckets ?? {})) {
      rows.push(['Aging', AGING_LABELS[bucket] ?? bucket, value.count, value.total]);
    }
    downloadCsv(reportCsvFilename('visao-financeira'), rows[0] as string[], rows.slice(1));
  };

  if (loading) return <HubLoading variant="block" label="Carregando relatório…" />;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} />
      </div>

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

      <div className="hub-relatorios__charts-row">
        <section className="hub-finance-page__section hub-relatorios__chart-panel">
          <h2 className="hub-clientes__form-title">Faturamento por forma de pagamento</h2>
          {methodChart.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem pagamentos"
              description="Não há faturamento recebido no período selecionado."
            />
          ) : (
            <>
              <div className="hub-relatorios__chart">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={methodChart} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}>
                      {methodChart.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBrl(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="hub-finance-page__report-list">
                {methodChart.map((row) => (
                  <div key={row.name} className="hub-finance-page__report-row">
                    <span>{row.name}</span>
                    <strong>{formatBrl(row.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="hub-finance-page__section hub-relatorios__chart-panel">
          <h2 className="hub-clientes__form-title">Serviços mais vendidos</h2>
          {servicesChart.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem serviços"
              description="Não há linhas de serviço vendidas no período."
            />
          ) : (
            <div className="hub-relatorios__chart hub-relatorios__chart--tall">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={servicesChart} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatBrl(v)} />
                  <Bar dataKey="total" fill="#f0642f" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Aging de recebíveis</h2>
        <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
          Base <strong>{aging?.as_of ?? '—'}</strong> (fim do período de faturamento).
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
    </>
  );
};

export default HubRelatoriosFinanceOverview;
