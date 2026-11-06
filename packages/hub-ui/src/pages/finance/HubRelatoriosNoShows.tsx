import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarClock, Percent, UserMinus } from 'lucide-react';
import { hubFinancialApi, type HubNoShowsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { appointmentDrillHref, boardingDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosNoShows: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:no-shows`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubNoShowsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getNoShowsReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar no-shows');
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

  const items = data?.items ?? [];
  const total = data?.summary.total_no_shows ?? 0;
  const rate = data?.summary.rate_pct ?? 0;
  const boarding = data?.summary.boarding_no_shows ?? 0;
  const appointment = data?.summary.appointment_implied_no_shows ?? 0;

  const sourceBars = useMemo(() => {
    const rows = [
      { key: 'boarding', label: 'Hotel/Creche', count: boarding, tone: 'risk' as const },
      { key: 'agenda', label: 'Agenda (implícito)', count: appointment, tone: 'ok' as const },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [boarding, appointment]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'No-shows e faltas',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'no-shows',
    headers: ['Quando', 'Origem', 'Tipo', 'Cliente', 'Telefone', 'Pet', 'Status'],
    rows: items.map((i) => [
      i.when_at,
      i.source === 'boarding' ? 'Hotel/Creche' : 'Agenda',
      i.kind_label,
      i.guardian_name,
      i.phone,
      i.pet_name,
      i.status,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando faltas…" />;
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
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando faltas…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total de faltas</div>
            <div className="hub-servicos__metric-value">{total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <UserMinus size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa estimada</div>
            <div className="hub-servicos__metric-value">{rate.toLocaleString('pt-BR')}%</div>
            <div className="hub-servicos__metric-sub">
              {(data?.summary.attended_count ?? 0).toLocaleString('pt-BR')} atendidos no período
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${rate > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Hotel/Creche</div>
            <div className="hub-servicos__metric-value">{boarding.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Reservas sem comparecimento</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${boarding > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Building2 size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Agenda (implícito)</div>
            <div className="hub-servicos__metric-value">{appointment.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Horário passado sem baixa</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${appointment > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <CalendarClock size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {sourceBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-noshows-source-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-noshows-source-title" className="hub-relatorios__section-title">
                Origem das faltas
              </h2>
              <p className="hub-relatorios__panel-sub">
                Inclui reservas marcadas como não compareceu e agendamentos ainda confirmados/pendentes
                cujo horário já passou
              </p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {sourceBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                    style={{ width: `${Math.max(row.widthPct, row.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-noshows-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-noshows-list-title" className="hub-relatorios__section-title">
              Detalhe das faltas
            </h2>
            <p className="hub-relatorios__panel-sub">
              Lista completa de no-shows e faltas implícitas no período
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Registros</span>
            <span className="hub-relatorios__panel-stat-value">
              {items.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma falta"
            description="Não há no-shows ou faltas implícitas no período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Origem</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Pet</th>
                  <th>Telefone</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={`${row.source}-${row.id}`}>
                    <td>
                      {row.source === 'appointment' ? (
                        <Link
                          to={appointmentDrillHref(row.id, row.when_at)}
                          className="hub-finance-page__dash-link"
                        >
                          <span className="hub-relatorios__cell-primary">
                            {formatDateBr(row.when_at)}
                          </span>
                        </Link>
                      ) : (
                        <Link to={boardingDrillHref()} className="hub-finance-page__dash-link">
                          <span className="hub-relatorios__cell-primary">
                            {formatDateBr(row.when_at)}
                          </span>
                        </Link>
                      )}
                    </td>
                    <td>{row.source === 'boarding' ? 'Hotel/Creche' : 'Agenda'}</td>
                    <td>{row.kind_label}</td>
                    <td>{row.guardian_name ?? '—'}</td>
                    <td>{row.pet_name ?? '—'}</td>
                    <td>{row.phone ?? '—'}</td>
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

export default HubRelatoriosNoShows;
