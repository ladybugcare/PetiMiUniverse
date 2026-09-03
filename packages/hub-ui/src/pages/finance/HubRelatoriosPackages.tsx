import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubFinancePackagesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

type PackageRow = HubFinancePackagesReport['purchased'][number];

function PackageTable({ rows }: { rows: PackageRow[] }) {
  return (
    <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
      <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
        <thead>
          <tr>
            <th>Pacote</th>
            <th>Cliente</th>
            <th>Pet</th>
            <th className="hub-finance-page__th-num">Sessões</th>
            <th>Compra</th>
            <th>Validade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div>{row.package_name || '—'}</div>
                {row.service_name ? (
                  <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                    {row.service_name}
                  </div>
                ) : null}
              </td>
              <td>
                <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                  {row.guardian_name || '—'}
                </Link>
              </td>
              <td>{row.pet_name || '—'}</td>
              <td className="hub-finance-page__td-num">
                {row.sessions_remaining}/{row.sessions_total || '—'}
              </td>
              <td>{formatDateBr(row.purchased_at)}</td>
              <td>{row.expires_at ? formatDateBr(row.expires_at) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const HubRelatoriosPackages: React.FC<Props> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubFinancePackagesReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubFinancialApi.getPackagesReport(clinicId, periodToApiOpts(period)));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pacotes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando pacotes…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('pacotes'),
      ['Seção', 'Pacote', 'Serviço', 'Cliente', 'Pet', 'Restantes', 'Total', 'Compra', 'Validade'],
      [
        ...data.purchased.map((row) => [
          'Vendidos',
          row.package_name,
          row.service_name,
          row.guardian_name,
          row.pet_name,
          row.sessions_remaining,
          row.sessions_total,
          row.purchased_at,
          row.expires_at,
        ]),
        ...data.expiring.map((row) => [
          'A vencer',
          row.package_name,
          row.service_name,
          row.guardian_name,
          row.pet_name,
          row.sessions_remaining,
          row.sessions_total,
          row.purchased_at,
          row.expires_at,
        ]),
      ],
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton
          onClick={onExport}
          disabled={!data?.purchased.length && !data?.expiring.length}
        />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vendidos</div>
            <div className="hub-servicos__metric-value">{data?.summary.purchased_lines ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sessões vendidas</div>
            <div className="hub-servicos__metric-value">{data?.summary.sessions_sold ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              Consumidas: {data?.summary.sessions_redeemed ?? 0}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ativos com saldo</div>
            <div className="hub-servicos__metric-value">{data?.summary.active_with_balance ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              A vencer: {data?.summary.expiring_soon ?? 0}
            </div>
          </div>
        </div>
      </div>

      <h3 className="hub-relatorios__section-title">Vendidos no período</h3>
      {(data?.purchased.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty title="Nenhuma venda de pacote" description="Não há saldos comprados no período." />
      ) : (
        <div style={{ marginBottom: 24 }}>
          <PackageTable rows={data!.purchased} />
        </div>
      )}

      <h3 className="hub-relatorios__section-title">A vencer</h3>
      {(data?.expiring.length ?? 0) === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhum pacote a vencer"
          description="Não há saldos ativos com validade próxima."
        />
      ) : (
        <PackageTable rows={data!.expiring} />
      )}
    </>
  );
};

export default HubRelatoriosPackages;
