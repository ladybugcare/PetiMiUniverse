import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Package, ShoppingBag, Ticket } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinancePackagesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
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
                <div className="hub-relatorios__cell-primary">{row.package_name || '—'}</div>
                {row.service_name ? (
                  <div className="hub-relatorios__cell-meta">{row.service_name}</div>
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
  const resourceKey = `${clinicId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:packages`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinancePackagesReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getPackagesReport(clinicId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pacotes');
    } finally {
      finish();
    }
  }, [clinicId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const redeemRate = useMemo(() => {
    const sold = data?.summary.sessions_sold ?? 0;
    const redeemed = data?.summary.sessions_redeemed ?? 0;
    return sold > 0 ? (redeemed / sold) * 100 : 0;
  }, [data]);

  const empty = !data?.purchased.length && !data?.expiring.length;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Pacotes',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'pacotes',
    headers: ['Seção', 'Pacote', 'Serviço', 'Cliente', 'Pet', 'Restantes', 'Total', 'Compra', 'Validade'],
    rows: [
      ...(data?.purchased ?? []).map((row) => [
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
      ...(data?.expiring ?? []).map((row) => [
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
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando pacotes…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={empty} />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando pacotes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vendidos</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.purchased_lines ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ShoppingBag size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Sessões vendidas</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.sessions_sold ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">
              Consumidas: {(data?.summary.sessions_redeemed ?? 0).toLocaleString('pt-BR')} (
              {redeemRate.toFixed(0)}%)
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Ticket size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ativos com saldo</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.active_with_balance ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Pacotes ainda utilizáveis</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Package size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">A vencer</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.expiring_soon ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Validade próxima</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.expiring_soon ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-packages-sold-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-packages-sold-title" className="hub-relatorios__section-title">
              Vendidos no período
            </h2>
            <p className="hub-relatorios__panel-sub">Saldos comprados no intervalo selecionado</p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Linhas</span>
            <span className="hub-relatorios__panel-stat-value">
              {(data?.purchased.length ?? 0).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {(data?.purchased.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma venda de pacote"
            description="Não há saldos comprados no período."
          />
        ) : (
          <PackageTable rows={data!.purchased} />
        )}
      </section>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-packages-expiring-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-packages-expiring-title" className="hub-relatorios__section-title">
              A vencer
            </h2>
            <p className="hub-relatorios__panel-sub">Saldos ativos com validade próxima</p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Linhas</span>
            <span className="hub-relatorios__panel-stat-value">
              {(data?.expiring.length ?? 0).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {(data?.expiring.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum pacote a vencer"
            description="Não há saldos ativos com validade próxima."
          />
        ) : (
          <PackageTable rows={data!.expiring} />
        )}
      </section>
    </div>
  );
};

export default HubRelatoriosPackages;
