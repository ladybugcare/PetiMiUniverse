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
import { Building2, Home, Percent, Users } from 'lucide-react';
import { hubFinancialApi, type HubBoardingOccupancySeriesReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosBoardingOccupancy: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:boarding-occupancy`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubBoardingOccupancySeriesReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getBoardingOccupancySeriesReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar ocupação');
    } finally {
      finish();
    }
  }, [clinicId, unitId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const days = data?.days ?? [];
  const peakHotel = data?.summary.peak_hotel ?? 0;
  const peakDaycare = data?.summary.peak_daycare ?? 0;
  const avgHotel = data?.summary.avg_hotel_pct;
  const avgDaycare = data?.summary.avg_daycare_pct;

  const chartData = useMemo(
    () =>
      days.map((d) => ({
        date: formatDateBr(d.date).slice(0, 5),
        fullDate: formatDateBr(d.date),
        hotel: d.hotel_current,
        creche: d.daycare_current,
      })),
    [days],
  );

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Ocupação hotel e creche',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'ocupacao-hotel',
    headers: ['Data', 'Hotel', 'Cap. hotel', '% hotel', 'Creche', 'Cap. creche', '% creche'],
    rows: days.map((d) => [
      d.date,
      d.hotel_current,
      d.hotel_max,
      d.hotel_pct,
      d.daycare_current,
      d.daycare_max,
      d.daycare_pct,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando ocupação…" />;
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
          disabled={days.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando ocupação…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pico hotel</div>
            <div className="hub-servicos__metric-value">{peakHotel.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">
              Capacidade {data?.capacity.hotel_max ?? '—'}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Building2 size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Média ocupação hotel</div>
            <div className="hub-servicos__metric-value">
              {avgHotel != null ? `${avgHotel.toLocaleString('pt-BR')}%` : '—'}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${avgHotel != null && avgHotel > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pico creche</div>
            <div className="hub-servicos__metric-value">{peakDaycare.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">
              Capacidade {data?.capacity.daycare_max ?? '—'}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Home size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Média ocupação creche</div>
            <div className="hub-servicos__metric-value">
              {avgDaycare != null ? `${avgDaycare.toLocaleString('pt-BR')}%` : '—'}
            </div>
            <div className="hub-servicos__metric-sub">
              {days.length.toLocaleString('pt-BR')} dias na série
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${avgDaycare != null && avgDaycare > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {chartData.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-boarding-chart-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-boarding-chart-title" className="hub-relatorios__section-title">
                Ocupação diária
              </h2>
              <p className="hub-relatorios__panel-sub">
                Pets hospedados no hotel e na creche ao longo do período
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
                <YAxis tick={{ fontSize: 11, fill: '#8a6f64' }} width={36} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(_label, payload) =>
                    (payload?.[0]?.payload as { fullDate?: string } | undefined)?.fullDate ??
                    String(_label)
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="hotel"
                  name="Hotel"
                  stroke="#f0642f"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="creche"
                  name="Creche"
                  stroke="#0f766e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-boarding-table-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-boarding-table-title" className="hub-relatorios__section-title">
              Detalhe por dia
            </h2>
            <p className="hub-relatorios__panel-sub">
              Ocupação e percentual em relação à capacidade configurada
            </p>
          </div>
        </div>
        {days.length === 0 ? (
          <HubRelatoriosEmpty
            title="Sem dados"
            description="Não há série de ocupação para o período."
          />
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
                {days.map((d) => (
                  <tr key={d.date}>
                    <td>
                      <div className="hub-relatorios__cell-primary">{formatDateBr(d.date)}</div>
                    </td>
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
    </div>
  );
};

export default HubRelatoriosBoardingOccupancy;
