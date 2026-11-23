import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Percent, UserMinus } from 'lucide-react';
import { hubFinancialApi, type HubMyNoShowsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { appointmentDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosMyNoShows: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:my-no-shows`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubMyNoShowsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getMyNoShowsReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar seus no-shows');
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
  const attended = data?.summary.attended_count ?? 0;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Meus no-shows',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'meus-no-shows',
    headers: ['Quando', 'Tipo', 'Cliente', 'Telefone', 'Pet', 'Status'],
    rows: items.map((i) => [
      i.when_at,
      i.kind_label,
      i.guardian_name,
      i.phone,
      i.pet_name,
      i.status,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando seus no-shows…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
          <span className="hub-clientes__muted"> — somente os seus agendamentos</span>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando seus no-shows…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Suas faltas</div>
            <div className="hub-servicos__metric-value">{total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Agendamentos sem evolução</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <UserMinus size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Atendidos</div>
            <div className="hub-servicos__metric-value">{attended.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Com evolução no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CalendarClock size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa de falta</div>
            <div className="hub-servicos__metric-value">{rate.toLocaleString('pt-BR')}%</div>
            <div className="hub-servicos__metric-sub">Sobre o seu volume</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-noshow-items-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-my-noshow-items-title" className="hub-relatorios__section-title">
              Detalhe
            </h2>
            <p className="hub-relatorios__panel-sub">
              Agendamentos seus que passaram do horário sem evolução
            </p>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma falta sua"
            description="Não há no-shows implícitos nos seus agendamentos neste período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>Pet</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="hub-clientes__link"
                        to={appointmentDrillHref(row.id, row.when_at)}
                      >
                        {formatDateBr(row.when_at)}
                      </Link>
                    </td>
                    <td>{row.kind_label}</td>
                    <td>{row.guardian_name ?? '—'}</td>
                    <td>{row.phone ?? '—'}</td>
                    <td>{row.pet_name ?? '—'}</td>
                    <td>{row.status}</td>
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
