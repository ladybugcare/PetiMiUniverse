import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Scale } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceCashFlowDay,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosCashFlow: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:cash-flow`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [days, setDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubFinancialApi.getCashFlow(clinicId, unitId, periodToApiOpts(period));
      setDays(res.days ?? []);
      setRange(res.period);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar fluxo de caixa');
    } finally {
      finish();
    }
  }, [clinicId, unitId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    let payments_in = 0;
    let expenses_out = 0;
    let deposits_in = 0;
    let withdrawals_out = 0;
    let net = 0;
    for (const d of days) {
      payments_in += d.payments_in;
      expenses_out += d.expenses_out;
      deposits_in += d.deposits_in;
      withdrawals_out += d.withdrawals_out;
      net += d.net;
    }
    return {
      payments_in,
      expenses_out,
      deposits_in,
      withdrawals_out,
      outflows: expenses_out + withdrawals_out,
      inflows: payments_in + deposits_in,
      net,
    };
  }, [days]);

  const periodLabel = range
    ? `${formatDateBr(range.from)} a ${formatDateBr(range.to)}`
    : '—';

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: formatDateBr(d.date).slice(0, 5),
        fullDate: formatDateBr(d.date),
        entradas: d.payments_in + d.deposits_in,
        saidas: d.expenses_out + d.withdrawals_out,
        liquido: d.net,
      })),
    [days],
  );

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Fluxo de caixa',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'fluxo-caixa',
    headers: ['Data', 'Pagamentos', 'Depósitos', 'Despesas', 'Sangrias', 'Líquido'],
    rows: days.map((d) => [
      d.date,
      d.payments_in,
      d.deposits_in,
      d.expenses_out,
      d.withdrawals_out,
      d.net,
    ]),
    showError,
  });

  if (loading && days.length === 0 && !range) {
    return <HubLoading variant="block" label="Carregando fluxo de caixa…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={!days.length}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando fluxo de caixa…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pagamentos</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.payments_in)}</div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ArrowDownLeft size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saídas</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.outflows)}</div>
            <div className="hub-servicos__metric-sub">
              Despesas {formatBrl(summary.expenses_out)} · Sangrias{' '}
              {formatBrl(summary.withdrawals_out)}
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${summary.outflows > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <ArrowUpRight size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Depósitos</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.deposits_in)}</div>
            <div className="hub-servicos__metric-sub">Reforços de caixa no período</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${summary.deposits_in > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <PiggyBank size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Líquido</div>
            <div
              className={`hub-servicos__metric-value${
                summary.net < 0
                  ? ' hub-relatorios__metric-value--neg'
                  : summary.net > 0
                    ? ' hub-relatorios__metric-value--pos'
                    : ''
              }`}
            >
              {formatBrl(summary.net)}
            </div>
            <div className="hub-servicos__metric-sub">
              Entradas {formatBrl(summary.inflows)} − saídas {formatBrl(summary.outflows)}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Scale size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {days.length === 0 ? (
        <HubRelatoriosEmpty
          title="Sem movimentos no período"
          description="Não há pagamentos, despesas ou movimentos de caixa neste intervalo."
        />
      ) : (
        <>
          <section className="hub-relatorios__panel" aria-labelledby="relatorios-cashflow-chart-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-cashflow-chart-title" className="hub-relatorios__section-title">
                  Evolução diária
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Entradas, saídas e líquido ao longo do período
                </p>
              </div>
              <div className="hub-relatorios__panel-stat">
                <span className="hub-relatorios__panel-stat-label">Dias</span>
                <span className="hub-relatorios__panel-stat-value">
                  {days.length.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
            <div className="hub-relatorios__chart hub-relatorios__chart--tall">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8a6f64' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8a6f64' }}
                    width={56}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000
                        ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`
                        : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => formatBrl(v)}
                    labelFormatter={(_label, payload) =>
                      (payload?.[0]?.payload as { fullDate?: string } | undefined)?.fullDate ??
                      String(_label)
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name="Entradas"
                    stroke="#2f9e44"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name="Saídas"
                    stroke="#e03131"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="liquido"
                    name="Líquido"
                    stroke="#f0642f"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="hub-relatorios__panel" aria-labelledby="relatorios-cashflow-table-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-cashflow-table-title" className="hub-relatorios__section-title">
                  Movimentos por dia
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Pagamentos, depósitos, despesas/AP, sangrias e líquido diário
                </p>
              </div>
            </div>
            <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className="hub-finance-page__th-num">Pagamentos</th>
                    <th className="hub-finance-page__th-num">Depósitos</th>
                    <th className="hub-finance-page__th-num">Despesas / AP</th>
                    <th className="hub-finance-page__th-num">Sangrias</th>
                    <th className="hub-finance-page__th-num">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <td>
                        <div className="hub-relatorios__cell-primary">{formatDateBr(d.date)}</div>
                      </td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.payments_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.deposits_in)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.expenses_out)}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(d.withdrawals_out)}</td>
                      <td
                        className={`hub-finance-page__td-num${
                          d.net < 0
                            ? ' hub-relatorios__td-num--neg'
                            : d.net > 0
                              ? ' hub-relatorios__td-num--pos'
                              : ''
                        }`}
                      >
                        {formatBrl(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default HubRelatoriosCashFlow;
