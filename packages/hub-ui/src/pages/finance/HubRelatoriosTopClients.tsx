import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, Percent, Trophy, Users } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceTopClientsReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosTopClients: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:top-clients`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceTopClientsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getTopClientsReport(clinicId, unitId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar top clientes');
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

  const ticketAvg = useMemo(() => {
    const clients = data?.summary.clients_with_payments ?? 0;
    const revenue = data?.summary.total_revenue ?? 0;
    return clients > 0 ? revenue / clients : 0;
  }, [data]);

  const topShare = data?.items[0]?.share_pct ?? 0;
  const items = data?.items ?? [];

  const shareBars = useMemo(() => {
    const top = items.slice(0, 5);
    const max = Math.max(0, ...top.map((i) => i.total));
    return top.map((row) => ({
      ...row,
      widthPct: max > 0 ? (row.total / max) * 100 : 0,
    }));
  }, [items]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Top clientes',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'top-clientes',
    headers: ['#', 'Cliente', 'Telefone', 'Pagamentos', 'Total', 'Participação %'],
    rows: items.map((row) => [
      row.rank,
      row.full_name,
      row.phone,
      row.payments_count,
      row.total,
      row.share_pct,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando top clientes…" />;
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

      <HubRefreshingBanner show={refreshing} label="Atualizando top clientes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Clientes com pagamento</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.clients_with_payments ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Faturamento</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_revenue ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">Total de pagamentos no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ticket médio</div>
            <div className="hub-servicos__metric-value">{formatBrl(ticketAvg)}</div>
            <div className="hub-servicos__metric-sub">Por cliente que pagou</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Trophy size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Top 1</div>
            <div className="hub-servicos__metric-value">
              {topShare.toLocaleString('pt-BR')}%
            </div>
            <div className="hub-servicos__metric-sub">
              {items[0]?.full_name ?? 'Participação do líder'}
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${topShare > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {shareBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-top-share-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-top-share-title" className="hub-relatorios__section-title">
                Top 5 por faturamento
              </h2>
              <p className="hub-relatorios__panel-sub">Participação relativa entre os maiores pagadores</p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {shareBars.map((row) => (
              <li key={row.guardian_id} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">
                    #{row.rank} {row.full_name}
                  </span>
                  <span className="hub-relatorios__aging-count">
                    {row.share_pct.toLocaleString('pt-BR')}%
                  </span>
                  <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className="hub-relatorios__aging-fill hub-relatorios__aging-fill--risk"
                    style={{ width: `${Math.max(row.widthPct, row.total > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-top-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-top-list-title" className="hub-relatorios__section-title">
              Ranking completo
            </h2>
            <p className="hub-relatorios__panel-sub">Clientes ordenados por valor pago no período</p>
          </div>
        </div>
        {items.length === 0 ? (
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
                {items.map((row) => (
                  <tr key={row.guardian_id}>
                    <td>{row.rank}</td>
                    <td>
                      <Link
                        to={guardianDrillHref(row.guardian_id)}
                        className="hub-finance-page__dash-link"
                      >
                        <span className="hub-relatorios__cell-primary">{row.full_name}</span>
                      </Link>
                    </td>
                    <td>{row.phone || '—'}</td>
                    <td className="hub-finance-page__td-num">
                      {row.payments_count.toLocaleString('pt-BR')}
                    </td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.total)}</td>
                    <td className="hub-finance-page__td-num">
                      {row.share_pct.toLocaleString('pt-BR')}%
                    </td>
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

export default HubRelatoriosTopClients;
