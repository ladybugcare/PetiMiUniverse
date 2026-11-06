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
import { Clock, Scissors, Trophy, Users } from 'lucide-react';
import {
  hubFinancialApi,
  type HubGroomingProductivityReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { groomingQueueHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosGroomingProductivity: React.FC<Props> = ({
  clinicId,
  unitId,
  period,
}) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:grooming-productivity`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubGroomingProductivityReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getGroomingProductivityReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar produtividade B&T');
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

  const byStaff = data?.by_staff ?? [];
  const closed = data?.summary.closed_sessions ?? 0;
  const staffCount = data?.summary.staff_count ?? 0;
  const avgDuration = data?.summary.avg_duration_min;
  const topStaff = byStaff[0];

  const chartData = useMemo(
    () =>
      byStaff.slice(0, 12).map((s) => ({
        name: s.staff_name.length > 18 ? `${s.staff_name.slice(0, 16)}…` : s.staff_name,
        fullName: s.staff_name,
        closed: s.closed_count,
      })),
    [byStaff],
  );

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Produtividade Banho & Tosa',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'produtividade-banho-tosa',
    headers: ['Profissional', 'Sessões fechadas', 'Duração média (min)', 'Data', 'Fechadas no dia'],
    rows: [
      ...byStaff.map((row) => [
        row.staff_name,
        row.closed_count,
        row.avg_duration_min,
        null,
        null,
      ]),
      ...(data?.by_day ?? []).map((row) => [
        row.staff_name,
        null,
        null,
        row.date,
        row.closed_count,
      ]),
    ],
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando produtividade…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <div className="hub-relatorios__overview-toolbar-actions">
          <Link to={groomingQueueHref()} className="hub-finance-page__dash-link">
            Abrir Banho & Tosa
          </Link>
          <HubRelatoriosExportButton
            onClick={onExport}
            onPdf={onPdf}
            disabled={byStaff.length === 0}
          />
        </div>
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando produtividade…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sessões fechadas</div>
            <div className="hub-servicos__metric-value">{closed.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Scissors size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Profissionais</div>
            <div className="hub-servicos__metric-value">{staffCount.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Com sessões no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Duração média</div>
            <div className="hub-servicos__metric-value">
              {avgDuration != null ? `${avgDuration} min` : '—'}
            </div>
            <div className="hub-servicos__metric-sub">Por sessão fechada</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${avgDuration != null ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Clock size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Top 1</div>
            <div className="hub-servicos__metric-value">
              {(topStaff?.closed_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">
              {topStaff?.staff_name ?? 'Mais sessões fechadas'}
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${topStaff ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Trophy size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {byStaff.length === 0 ? (
        <HubRelatoriosEmpty
          title="Sem sessões fechadas"
          description="Não há atendimentos de Banho & Tosa concluídos no período."
        />
      ) : (
        <>
          <section className="hub-relatorios__panel" aria-labelledby="relatorios-grooming-chart-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-grooming-chart-title" className="hub-relatorios__section-title">
                  Fechadas por profissional
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Até 12 profissionais com mais sessões no período
                </p>
              </div>
            </div>
            <div className="hub-relatorios__chart-panel">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ede4df" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#8a6f64' }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11, fill: '#8a6f64' }} />
                  <Tooltip
                    labelFormatter={(_label, payload) =>
                      (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ??
                      String(_label)
                    }
                  />
                  <Bar
                    dataKey="closed"
                    name="Fechadas"
                    fill="var(--hc-brand, #f0642f)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="hub-relatorios__panel" aria-labelledby="relatorios-grooming-staff-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-grooming-staff-title" className="hub-relatorios__section-title">
                  Por profissional
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Sessões fechadas e duração média por membro da equipe
                </p>
              </div>
              <div className="hub-relatorios__panel-stat">
                <span className="hub-relatorios__panel-stat-label">Profissionais</span>
                <span className="hub-relatorios__panel-stat-value">
                  {byStaff.length.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
            <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
                <thead>
                  <tr>
                    <th>Profissional</th>
                    <th className="hub-finance-page__th-num">Fechadas</th>
                    <th className="hub-finance-page__th-num">Duração média</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((row) => (
                    <tr key={row.staff_id ?? row.staff_name}>
                      <td>
                        <div className="hub-relatorios__cell-primary">{row.staff_name}</div>
                      </td>
                      <td className="hub-finance-page__td-num">
                        {row.closed_count.toLocaleString('pt-BR')}
                      </td>
                      <td className="hub-finance-page__td-num">
                        {row.avg_duration_min != null ? `${row.avg_duration_min} min` : '—'}
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

export default HubRelatoriosGroomingProductivity;
