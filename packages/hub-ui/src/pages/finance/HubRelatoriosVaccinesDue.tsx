import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubVaccinesDueReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { guardianDrillHref, petDrillHref } from './hubRelatoriosLinks';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; days: number };

export const HubRelatoriosVaccinesDue: React.FC<Props> = ({ clinicId, days }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubVaccinesDueReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubFinancialApi.getVaccinesDueReport(clinicId, { days }));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar vacinas a vencer');
    } finally {
      setLoading(false);
    }
  }, [clinicId, days, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando vacinas…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('vacinas-a-vencer'),
      ['Pet', 'Vacina', 'Próxima dose', 'Em (dias)', 'Vencida', 'Tutor', 'Telefone', 'Última aplicação'],
      data.items.map((row) => [
        row.pet_name,
        row.vaccine_name,
        row.next_dose_at,
        row.days_until,
        row.overdue ? 'Sim' : 'Não',
        row.guardian_name,
        row.phone,
        row.administered_at,
      ]),
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">{data?.summary.total ?? 0}</div>
            <div className="hub-servicos__metric-sub">Vencidas + próximos {days} dias</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vencidas</div>
            <div className="hub-servicos__metric-value">{data?.summary.overdue ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">A vencer</div>
            <div className="hub-servicos__metric-value">{data?.summary.upcoming ?? 0}</div>
          </div>
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhuma vacina pendente"
          description="Não há próximas doses vencidas ou dentro da janela selecionada."
        />
      ) : (
        <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Vacina</th>
                <th>Próxima dose</th>
                <th className="hub-finance-page__th-num">Em</th>
                <th>Tutor</th>
                <th>Telefone</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={petDrillHref(row.pet_id)} className="hub-finance-page__dash-link">
                      {row.pet_name}
                    </Link>
                    {row.species ? (
                      <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                        {row.species}
                      </div>
                    ) : null}
                  </td>
                  <td>{row.vaccine_name}</td>
                  <td>
                    {formatDateBr(row.next_dose_at)}
                    {row.overdue ? (
                      <span className="hub-clientes__pill hub-finance-page__pill--warning" style={{ marginLeft: 8 }}>
                        Vencida
                      </span>
                    ) : null}
                  </td>
                  <td className="hub-finance-page__td-num">
                    {row.overdue
                      ? `${Math.abs(row.days_until)}d atrás`
                      : row.days_until === 0
                        ? 'Hoje'
                        : `${row.days_until}d`}
                  </td>
                  <td>
                    {row.guardian_id ? (
                      <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                        {row.guardian_name || '—'}
                      </Link>
                    ) : (
                      row.guardian_name || '—'
                    )}
                  </td>
                  <td>{row.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosVaccinesDue;
