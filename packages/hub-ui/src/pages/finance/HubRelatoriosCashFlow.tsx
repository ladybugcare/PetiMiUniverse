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
import {
  hubFinancialApi,
  type HubFinanceCashFlowDay,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosCashFlow: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<HubFinanceCashFlowDay[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubFinancialApi.getCashFlow(clinicId, unitId, periodToApiOpts(period));
      setDays(res.days ?? []);
      setRange(res.period);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar fluxo de caixa');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

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
    return { payments_in, expenses_out, deposits_in, withdrawals_out, net };
  }, [days]);

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: d.date.slice(5),
        entradas: d.payments_in + d.deposits_in,
        saidas: d.expenses_out + d.withdrawals_out,
        liquido: d.net,
      })),
    [days],
  );

  if (loading) return <HubLoading variant="block" label="Carregando fluxo de caixa…" />;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Fluxo de caixa',
    subtitle: range ? `${range.from} a ${range.to}` : null,
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

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={!days.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pagamentos</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.payments_in)}</div>
            <div className="hub-servicos__metric-sub">
              {range ? `${range.from} a ${range.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Despesas + sangrias</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(summary.expenses_out + summary.withdrawals_out)}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Líquido</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.net)}</div>
            <div className="hub-servicos__metric-sub">
              Depósitos: {formatBrl(summary.deposits_in)}
            </div>
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
          <div className="hub-relatorios__chart-panel" style={{ marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => formatBrl(v)} />
                <Legend />
                <Line type="monotone" dataKey="entradas" name="Entradas" stroke="#2f9e44" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="saidas" name="Saídas" stroke="#e03131" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="liquido" name="Líquido" stroke="var(--hc-brand, #f0642f)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="hub-finance-page__th-num">Pagamentos</th>
                  <th className="hub-finance-page__th-num">Depósitos</th>
                  <th className="hub-finance-page__th-num">Despesas</th>
                  <th className="hub-finance-page__th-num">Sangrias</th>
                  <th className="hub-finance-page__th-num">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDateBr(d.date)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(d.payments_in)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(d.deposits_in)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(d.expenses_out)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(d.withdrawals_out)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(d.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

export default HubRelatoriosCashFlow;
