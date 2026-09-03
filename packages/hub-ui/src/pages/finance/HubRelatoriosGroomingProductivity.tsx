import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  hubFinancialApi,
  type HubGroomingProductivityReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { groomingQueueHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosGroomingProductivity: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubGroomingProductivityReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await hubFinancialApi.getGroomingProductivityReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar produtividade B&T');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      (data?.by_staff ?? []).slice(0, 12).map((s) => ({
        name: s.staff_name.length > 18 ? `${s.staff_name.slice(0, 16)}…` : s.staff_name,
        closed: s.closed_count,
      })),
    [data],
  );

  if (loading) return <HubLoading variant="block" label="Carregando produtividade…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('produtividade-banho-tosa'),
      ['Profissional', 'Sessões fechadas', 'Duração média (min)', 'Data', 'Fechadas no dia'],
      [
        ...data.by_staff.map((row) => [
          row.staff_name,
          row.closed_count,
          row.avg_duration_min,
          null,
          null,
        ]),
        ...data.by_day.map((row) => [row.staff_name, null, null, row.date, row.closed_count]),
      ],
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.by_staff.length} />
        <Link to={groomingQueueHref()} className="hub-finance-page__dash-link">
          Abrir Banho & Tosa
        </Link>
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sessões fechadas</div>
            <div className="hub-servicos__metric-value">{data?.summary.closed_sessions ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Profissionais</div>
            <div className="hub-servicos__metric-value">{data?.summary.staff_count ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Duração média</div>
            <div className="hub-servicos__metric-value">
              {data?.summary.avg_duration_min != null ? `${data.summary.avg_duration_min} min` : '—'}
            </div>
          </div>
        </div>
      </div>

      {(data?.by_staff.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty
          title="Sem sessões fechadas"
          description="Não há atendimentos de Banho & Tosa concluídos no período."
        />
      ) : (
        <>
          <div className="hub-relatorios__chart-panel" style={{ marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="closed" name="Fechadas" fill="var(--hc-brand, #f0642f)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="hub-relatorios__section-title">Por profissional</h3>
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll" style={{ marginBottom: 24 }}>
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th className="hub-finance-page__th-num">Fechadas</th>
                  <th className="hub-finance-page__th-num">Duração média</th>
                </tr>
              </thead>
              <tbody>
                {data!.by_staff.map((row) => (
                  <tr key={row.staff_id ?? row.staff_name}>
                    <td>{row.staff_name}</td>
                    <td className="hub-finance-page__td-num">{row.closed_count}</td>
                    <td className="hub-finance-page__td-num">
                      {row.avg_duration_min != null ? `${row.avg_duration_min} min` : '—'}
                    </td>
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

export default HubRelatoriosGroomingProductivity;
