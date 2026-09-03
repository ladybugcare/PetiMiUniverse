import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubClientCohortsReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosClientCohorts: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubClientCohortsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await hubFinancialApi.getClientCohortsReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar novos e recorrentes');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando coortes…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('novos-recorrentes'),
      ['Grupo', 'Cliente', 'Telefone', 'Recebíveis', 'Total', 'Cadastro'],
      [
        ...data.new_clients.map((row) => [
          'Novo cadastro',
          row.full_name,
          row.phone,
          null,
          null,
          row.created_at,
        ]),
        ...data.first_purchase.map((row) => [
          'Primeira compra',
          row.full_name,
          row.phone,
          row.receivables_count,
          row.total,
          null,
        ]),
        ...data.recurring.map((row) => [
          'Recorrente',
          row.full_name,
          row.phone,
          row.receivables_count,
          row.total,
          null,
        ]),
      ],
    );
  };

  const empty =
    (data?.summary.new_clients_count ?? 0) === 0 &&
    (data?.summary.recurring_count ?? 0) === 0 &&
    (data?.summary.first_purchase_count ?? 0) === 0;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={empty} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Novos cadastros</div>
            <div className="hub-servicos__metric-value">{data?.summary.new_clients_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Primeira compra</div>
            <div className="hub-servicos__metric-value">{data?.summary.first_purchase_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">Primeiro recebível no período</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recorrentes</div>
            <div className="hub-servicos__metric-value">{data?.summary.recurring_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">Já compraram antes e voltaram</div>
          </div>
        </div>
      </div>

      {empty ? (
        <HubRelatoriosEmpty
          title="Sem movimento de clientes"
          description="Não há novos cadastros nem vendas suficientes no período para montar as coortes."
        />
      ) : (
        <>
          <h3 className="hub-relatorios__section-title">Novos cadastros</h3>
          {(data?.new_clients.length ?? 0) === 0 ? (
            <HubRelatoriosEmpty title="Nenhum cadastro novo" description="Nenhum tutor criado neste período." />
          ) : (
            <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll" style={{ marginBottom: 24 }}>
              <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th>Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.new_clients.map((row) => (
                    <tr key={row.guardian_id}>
                      <td>
                        <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                          {row.full_name}
                        </Link>
                      </td>
                      <td>{row.phone || '—'}</td>
                      <td>{formatDateBr(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="hub-relatorios__section-title">Primeira compra</h3>
          {(data?.first_purchase.length ?? 0) === 0 ? (
            <HubRelatoriosEmpty
              title="Nenhuma primeira compra"
              description="Nenhum tutor teve o primeiro recebível neste período."
            />
          ) : (
            <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll" style={{ marginBottom: 24 }}>
              <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th className="hub-finance-page__th-num">Recebíveis</th>
                    <th className="hub-finance-page__th-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.first_purchase.map((row) => (
                    <tr key={row.guardian_id}>
                      <td>
                        <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                          {row.full_name}
                        </Link>
                      </td>
                      <td>{row.phone || '—'}</td>
                      <td className="hub-finance-page__td-num">{row.receivables_count}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="hub-relatorios__section-title">Recorrentes</h3>
          {(data?.recurring.length ?? 0) === 0 ? (
            <HubRelatoriosEmpty
              title="Nenhum recorrente"
              description="Nenhum cliente com histórico anterior comprou de novo neste período."
            />
          ) : (
            <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
              <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th className="hub-finance-page__th-num">Recebíveis</th>
                    <th className="hub-finance-page__th-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.recurring.map((row) => (
                    <tr key={row.guardian_id}>
                      <td>
                        <Link to={guardianDrillHref(row.guardian_id)} className="hub-finance-page__dash-link">
                          {row.full_name}
                        </Link>
                      </td>
                      <td>{row.phone || '—'}</td>
                      <td className="hub-finance-page__td-num">{row.receivables_count}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default HubRelatoriosClientCohorts;
