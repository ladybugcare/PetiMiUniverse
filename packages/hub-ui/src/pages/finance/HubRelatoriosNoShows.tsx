import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubFinancialApi, type HubNoShowsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { appointmentDrillHref, boardingDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosNoShows: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubNoShowsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await hubFinancialApi.getNoShowsReport(clinicId, { ...periodToApiOpts(period), unit_id: unitId })
      );
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar no-shows');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('no-shows'),
      ['Quando', 'Origem', 'Tipo', 'Cliente', 'Telefone', 'Pet', 'Status'],
      data.items.map((i) => [
        i.when_at,
        i.source === 'boarding' ? 'Hotel/Creche' : 'Agenda',
        i.kind_label,
        i.guardian_name,
        i.phone,
        i.pet_name,
        i.status,
      ])
    );
  };

  if (loading) return <HubLoading variant="block" label="Carregando faltas…" />;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total de faltas</div>
            <div className="hub-servicos__metric-value">{data?.summary.total_no_shows ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa estimada</div>
            <div className="hub-servicos__metric-value">{data?.summary.rate_pct ?? 0}%</div>
            <div className="hub-servicos__metric-sub">
              {data?.summary.attended_count ?? 0} atendidos no período
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Hotel/Creche</div>
            <div className="hub-servicos__metric-value">{data?.summary.boarding_no_shows ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Agenda (implícito)</div>
            <div className="hub-servicos__metric-value">{data?.summary.appointment_implied_no_shows ?? 0}</div>
          </div>
        </div>
      </div>

      <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
        Inclui reservas marcadas como não compareceu e agendamentos ainda confirmados/pendentes cujo
        horário já passou.
      </p>

      {(data?.items.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty title="Nenhuma falta" description="Não há no-shows ou faltas implícitas no período." />
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
              {data!.items.map((row) => (
                <tr key={`${row.source}-${row.id}`}>
                  <td>
                    {row.source === 'appointment' ? (
                      <Link
                        to={appointmentDrillHref(row.id, row.when_at)}
                        className="hub-finance-page__dash-link"
                      >
                        {formatDateBr(row.when_at)}
                      </Link>
                    ) : (
                      <Link to={boardingDrillHref()} className="hub-finance-page__dash-link">
                        {formatDateBr(row.when_at)}
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
    </>
  );
};

export default HubRelatoriosNoShows;
