import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubFinanceTopClientsReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosTopClients: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubFinanceTopClientsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubFinancialApi.getTopClientsReport(clinicId, unitId, periodToApiOpts(period)));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar top clientes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando top clientes…" />;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Top clientes',
    subtitle: data ? `${data.period.from} a ${data.period.to}` : null,
    slug: 'top-clientes',
    headers: ['#', 'Cliente', 'Telefone', 'Pagamentos', 'Total', 'Participação %'],
    rows: (data?.items ?? []).map((row) => [
      row.rank,
      row.full_name,
      row.phone,
      row.payments_count,
      row.total,
      row.share_pct,
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
            <div className="hub-servicos__metric-label">Clientes com pagamento</div>
            <div className="hub-servicos__metric-value">{data?.summary.clients_with_payments ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Faturamento</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.summary.total_revenue ?? 0)}</div>
            <div className="hub-servicos__metric-sub">Total de pagamentos no período</div>
          </div>
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty
          title="Sem pagamentos no período"
          description="Não há clientes com pagamentos registrados neste intervalo."
        />
      ) : (
        <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
          <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th className="hub-finance-page__th-num">Pagamentos</th>
                <th className="hub-finance-page__th-num">Total</th>
                <th className="hub-finance-page__th-num">%</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((row) => (
                <tr key={row.guardian_id}>
                  <td>{row.rank}</td>
                  <td>
                    <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                      {row.full_name}
                    </Link>
                  </td>
                  <td>{row.phone || '—'}</td>
                  <td className="hub-finance-page__td-num">{row.payments_count}</td>
                  <td className="hub-finance-page__td-num">{formatBrl(row.total)}</td>
                  <td className="hub-finance-page__td-num">{row.share_pct.toLocaleString('pt-BR')}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosTopClients;
