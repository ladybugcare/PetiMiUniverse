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
import { hubFinancialApi, type HubBoardingOccupancySeriesReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosBoardingOccupancy: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubBoardingOccupancySeriesReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await hubFinancialApi.getBoardingOccupancySeriesReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        })
      );
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar ocupação');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        date: d.date.slice(5),
        hotel: d.hotel_current,
        creche: d.daycare_current,
        hotelMax: d.hotel_max,
        crecheMax: d.daycare_max,
      })),
    [data]
  );

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('ocupacao-hotel'),
      ['Data', 'Hotel', 'Cap. hotel', '% hotel', 'Creche', 'Cap. creche', '% creche'],
      data.days.map((d) => [
        d.date,
        d.hotel_current,
        d.hotel_max,
        d.hotel_pct,
        d.daycare_current,
        d.daycare_max,
        d.daycare_pct,
      ])
    );
  };

  if (loading) return <HubLoading variant="block" label="Carregando ocupação…" />;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.days.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pico hotel</div>
            <div className="hub-servicos__metric-value">{data?.summary.peak_hotel ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              Capacidade {data?.capacity.hotel_max ?? '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Média ocupação hotel</div>
            <div className="hub-servicos__metric-value">
              {data?.summary.avg_hotel_pct != null ? `${data.summary.avg_hotel_pct}%` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pico creche</div>
            <div className="hub-servicos__metric-value">{data?.summary.peak_daycare ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              Capacidade {data?.capacity.daycare_max ?? '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Média ocupação creche</div>
            <div className="hub-servicos__metric-value">
              {data?.summary.avg_daycare_pct != null ? `${data.summary.avg_daycare_pct}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {chartData.length > 0 ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Ocupação diária</h2>
          <div className="hub-relatorios__chart hub-relatorios__chart--tall">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="hotel" name="Hotel" stroke="#f0642f" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="creche" name="Creche" stroke="#0f766e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Detalhe por dia</h2>
        {(data?.days.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty title="Sem dados" description="Não há série de ocupação para o período." />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="hub-finance-page__th-num">Hotel</th>
                  <th className="hub-finance-page__th-num">% hotel</th>
                  <th className="hub-finance-page__th-num">Creche</th>
                  <th className="hub-finance-page__th-num">% creche</th>
                </tr>
              </thead>
              <tbody>
                {data!.days.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDateBr(d.date)}</td>
                    <td className="hub-finance-page__td-num">
                      {d.hotel_current}
                      {d.hotel_max != null ? ` / ${d.hotel_max}` : ''}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {d.hotel_pct != null ? `${d.hotel_pct}%` : '—'}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {d.daycare_current}
                      {d.daycare_max != null ? ` / ${d.daycare_max}` : ''}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {d.daycare_pct != null ? `${d.daycare_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};

export default HubRelatoriosBoardingOccupancy;
