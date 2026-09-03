import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubFinancialApi, type HubAbsentClientsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { formatDateBr } from './hubRelatoriosUtils';

const SOURCE_LABELS: Record<string, string> = {
  appointment: 'Agendamento',
  receivable: 'Cobrança',
};

type HubRelatoriosAbsentClientsProps = {
  clinicId: string;
  unitId: string | null;
  days: number;
};

export const HubRelatoriosAbsentClients: React.FC<HubRelatoriosAbsentClientsProps> = ({
  clinicId,
  unitId,
  days,
}) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubAbsentClientsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubFinancialApi.getAbsentClientsReport(clinicId, {
        days,
        unit_id: unitId,
      });
      setData(res);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar clientes ausentes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, days, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando clientes ausentes…" />;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Clientes ausentes',
    subtitle: `≥ ${days} dias`,
    slug: 'clientes-ausentes',
    headers: ['Cliente', 'Telefone', 'E-mail', 'Última atividade', 'Origem', 'Dias ausente', 'Nunca atendido'],
    rows: (data?.items ?? []).map((row) => [
      row.full_name,
      row.phone,
      row.email,
      row.last_activity_at,
      row.last_activity_source,
      row.days_absent,
      row.never_attended ? 'sim' : 'não',
    ]),
    showError,
  });

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ausentes (≥ {days} dias)</div>
            <div className="hub-servicos__metric-value">{data?.summary.absent_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              Corte {data?.cutoff ? formatDateBr(data.cutoff) : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Nunca atendidos</div>
            <div className="hub-servicos__metric-value">{data?.summary.never_attended_count ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Clientes ativos analisados</div>
            <div className="hub-servicos__metric-value">{data?.summary.active_guardians_scanned ?? 0}</div>
          </div>
        </div>
      </div>

      <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
        Considera última atividade em agendamento (não cancelado) ou recebível. Lista limitada a 500
        resultados.
        {unitId ? ' Filtro de unidade aplicado quando disponível.' : ''}
      </p>

      {(data?.items.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhum cliente ausente"
          description="Todos os clientes ativos tiveram atividade recente no critério selecionado."
        />
      ) : (
        <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Última atividade</th>
                <th>Origem</th>
                <th className="hub-finance-page__th-num">Dias ausente</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((row) => (
                <tr key={row.guardian_id}>
                  <td>
                    <Link to={`/hub/clientes/${row.guardian_id}`} className="hub-finance-page__dash-link">
                      {row.full_name}
                    </Link>
                  </td>
                  <td>{row.phone || '—'}</td>
                  <td>
                    {row.never_attended ? (
                      <span className="hub-clientes__pill hub-finance-page__pill--warning">Nunca</span>
                    ) : (
                      formatDateBr(row.last_activity_at)
                    )}
                  </td>
                  <td>
                    {row.last_activity_source
                      ? SOURCE_LABELS[row.last_activity_source] ?? row.last_activity_source
                      : '—'}
                  </td>
                  <td className="hub-finance-page__td-num">
                    {row.days_absent != null ? row.days_absent : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosAbsentClients;
