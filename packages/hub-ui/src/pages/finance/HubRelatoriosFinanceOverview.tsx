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
import { AlertTriangle, CircleDollarSign, Receipt, Wallet } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceAgingReport,
  type HubFinanceRevenueReport,
  type HubFinanceTicketAverageReport,
  type HubFinanceTopServicesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

const AGING_ORDER = ['not_due', 'no_due_date', 'overdue_1_30', 'overdue_31_60', 'overdue_61_plus'] as const;

const AGING_LABELS: Record<string, string> = {
  no_due_date: 'Sem vencimento',
  not_due: 'A vencer',
  overdue_1_30: 'Vencidos 1–30 dias',
  overdue_31_60: 'Vencidos 31–60 dias',
  overdue_61_plus: 'Vencidos 61+ dias',
};

const AGING_TONE: Record<string, string> = {
  not_due: 'ok',
  no_due_date: 'muted',
  overdue_1_30: 'warn',
  overdue_31_60: 'risk',
  overdue_61_plus: 'critical',
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
  const [dateBasis, setDateBasis] = useState<'payment_date' | 'created_at'>('payment_date');
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:rev:${dateBasis}`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [revenue, setRevenue] = useState<HubFinanceRevenueReport | null>(null);
  const [ticket, setTicket] = useState<HubFinanceTicketAverageReport | null>(null);
  const [topServices, setTopServices] = useState<HubFinanceTopServicesReport | null>(null);
  const [aging, setAging] = useState<HubFinanceAgingReport | null>(null);

  const loadReports = useCallback(async () => {
    begin();
    try {
      const opts = periodToApiOpts(period);
      const [rev, tic, top] = await Promise.all([
        hubFinancialApi.getRevenueReport(clinicId, unitId, { ...opts, date_basis: dateBasis }),
        hubFinancialApi.getTicketAverageReport(clinicId, unitId, opts),
        hubFinancialApi.getTopServicesReport(clinicId, unitId, opts),
      ]);
      const ag = await hubFinancialApi.getAgingReport(clinicId, unitId, { as_of: rev.period.to });
      setRevenue(rev);
      setTicket(tic);
      setTopServices(top);
      setAging(ag);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar relatório financeiro');
    } finally {
      finish();
    }
  }, [clinicId, unitId, period, dateBasis, showError, begin, succeed, finish]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const methodChart = useMemo(() => {
    const rows = Object.entries(revenue?.by_method ?? {}).map(([method, total]) => ({
      name: paymentMethodLabel(method),
      value: total,
    }));
    const sum = rows.reduce((acc, row) => acc + row.value, 0);
    return rows
      .map((row) => ({
        ...row,
        pct: sum > 0 ? (row.value / sum) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [revenue]);

  const servicesChart = useMemo(
    () =>
      (topServices?.items ?? []).slice(0, 8).map((item) => ({
        name: item.name.length > 18 ? `${item.name.slice(0, 16)}…` : item.name,
        fullName: item.name,
        total: item.total,
        quantity: item.quantity,
      })),
    [topServices],
  );

  const agingRows = useMemo(() => {
    const buckets = aging?.buckets ?? {};
    const orderedKeys = [
      ...AGING_ORDER.filter((key) => key in buckets),
      ...Object.keys(buckets).filter((key) => !(AGING_ORDER as readonly string[]).includes(key)),
    ];
    const maxTotal = Math.max(0, ...orderedKeys.map((key) => buckets[key]?.total ?? 0));
    const openTotal = orderedKeys.reduce((acc, key) => acc + (buckets[key]?.total ?? 0), 0);
    const openCount = orderedKeys.reduce((acc, key) => acc + (buckets[key]?.count ?? 0), 0);
    return {
      rows: orderedKeys.map((key) => ({
        key,
        label: AGING_LABELS[key] ?? key,
        tone: AGING_TONE[key] ?? 'muted',
        count: buckets[key]?.count ?? 0,
        total: buckets[key]?.total ?? 0,
        widthPct: maxTotal > 0 ? ((buckets[key]?.total ?? 0) / maxTotal) * 100 : 0,
      })),
      openTotal,
      openCount,
    };
  }, [aging]);

  const periodLabel = revenue
    ? `${formatDateBr(revenue.period.from)} a ${formatDateBr(revenue.period.to)}`
    : '—';

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

  if (loading && !revenue) {
    return <HubLoading variant="block" label="Carregando relatório…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <div className="hub-payables__filters" role="group" aria-label="Base de data dos pagamentos">
          <button
            type="button"
            className={`hub-dayboard__toggle-btn${dateBasis === 'payment_date' ? ' hub-dayboard__toggle-btn--active' : ''}`}
            onClick={() => setDateBasis('payment_date')}
          >
            Data do pagamento
          </button>
          <button
            type="button"
            className={`hub-dayboard__toggle-btn${dateBasis === 'created_at' ? ' hub-dayboard__toggle-btn--active' : ''}`}
            onClick={() => setDateBasis('created_at')}
          >
            Data de registro
          </button>
        </div>
        <HubRelatoriosExportButton onClick={onExport} />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando visão financeira…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Faturamento recebido</div>
            <div className="hub-servicos__metric-value">{formatBrl(revenue?.total ?? 0)}</div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Wallet size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ticket médio</div>
            <div className="hub-servicos__metric-value">{formatBrl(ticket?.ticket_average ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              {(ticket?.receivables_count ?? 0).toLocaleString('pt-BR')} recebíveis
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recebíveis no período</div>
            <div className="hub-servicos__metric-value">
              {(ticket?.receivables_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">
              Total faturado {formatBrl(ticket?.total ?? 0)}
            </div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Receipt size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Em aberto (aging)</div>
            <div className="hub-servicos__metric-value">{formatBrl(agingRows.openTotal)}</div>
            <div className="hub-servicos__metric-sub">
              {agingRows.openCount.toLocaleString('pt-BR')} títulos · base{' '}
              {formatDateBr(aging?.as_of)}
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${agingRows.openTotal > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="hub-relatorios__charts-row">
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-methods-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-methods-title" className="hub-relatorios__section-title">
                Formas de pagamento
              </h2>
              <p className="hub-relatorios__panel-sub">Distribuição do faturamento recebido</p>
            </div>
          </div>
          {methodChart.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem pagamentos"
              description="Não há faturamento recebido no período selecionado."
            />
          ) : (
            <div className="hub-relatorios__panel-split">
              <div className="hub-relatorios__chart hub-relatorios__chart--pie">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={methodChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {methodChart.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatBrl(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="hub-relatorios__legend">
                {methodChart.map((row, i) => (
                  <li key={row.name} className="hub-relatorios__legend-item">
                    <span
                      className="hub-relatorios__legend-swatch"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      aria-hidden
                    />
                    <span className="hub-relatorios__legend-label">{row.name}</span>
                    <span className="hub-relatorios__legend-pct">{row.pct.toFixed(0)}%</span>
                    <strong className="hub-relatorios__legend-value">{formatBrl(row.value)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="hub-relatorios__panel" aria-labelledby="relatorios-services-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-services-title" className="hub-relatorios__section-title">
                Serviços mais vendidos
              </h2>
              <p className="hub-relatorios__panel-sub">Top 8 por valor no período</p>
            </div>
          </div>
          {servicesChart.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem serviços"
              description="Não há linhas de serviço vendidas no período."
            />
          ) : (
            <div className="hub-relatorios__chart hub-relatorios__chart--tall">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={servicesChart} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#8a6f64' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11, fill: '#6b554f' }}
                  />
                  <Tooltip
                    formatter={(v: number, _name, item) => [
                      formatBrl(v),
                      `${(item?.payload as { quantity?: number } | undefined)?.quantity ?? 0} un.`,
                    ]}
                    labelFormatter={(_label, payload) =>
                      (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? String(_label)
                    }
                  />
                  <Bar dataKey="total" fill="#f0642f" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-aging-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-aging-title" className="hub-relatorios__section-title">
              Aging de recebíveis
            </h2>
            <p className="hub-relatorios__panel-sub">
              Situação dos títulos em aberto em {formatDateBr(aging?.as_of)} (fim do período de
              faturamento).
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Total em aberto</span>
            <span className="hub-relatorios__panel-stat-value">{formatBrl(agingRows.openTotal)}</span>
          </div>
        </div>

        {agingRows.rows.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nada em aberto"
            description="Não há recebíveis pendentes na data de referência."
          />
        ) : (
          <ul className="hub-relatorios__aging-list">
            {agingRows.rows.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} {row.count === 1 ? 'título' : 'títulos'}
                  </span>
                  <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                    style={{ width: `${Math.max(row.widthPct, row.total > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default HubRelatoriosFinanceOverview;
