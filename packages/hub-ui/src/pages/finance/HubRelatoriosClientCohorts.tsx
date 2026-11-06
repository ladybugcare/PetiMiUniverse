import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ShoppingBag, UserPlus, Users } from 'lucide-react';
import {
  hubFinancialApi,
  type HubClientCohortsReport,
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

type Props = { clinicId: string; unitId: string | null; period: HubReportPeriod };

export const HubRelatoriosClientCohorts: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:cohorts`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubClientCohortsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getClientCohortsReport(clinicId, {
          ...periodToApiOpts(period),
          unit_id: unitId,
        }),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar novos e recorrentes');
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

  const summary = data?.summary;
  const totalTouched =
    (summary?.new_clients_count ?? 0) +
    (summary?.first_purchase_count ?? 0) +
    (summary?.recurring_count ?? 0);

  const cohortBars = useMemo(() => {
    if (!summary) return [];
    const rows = [
      { key: 'new', label: 'Novos cadastros', count: summary.new_clients_count, tone: 'ok' },
      {
        key: 'first',
        label: 'Primeira compra',
        count: summary.first_purchase_count,
        tone: 'warn',
      },
      { key: 'recurring', label: 'Recorrentes', count: summary.recurring_count, tone: 'risk' },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [summary]);

  const empty = totalTouched === 0;

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Novos e recorrentes',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'novos-recorrentes',
    headers: ['Grupo', 'Cliente', 'Telefone', 'Recebíveis', 'Total', 'Cadastro'],
    rows: [
      ...(data?.new_clients ?? []).map((row) => [
        'Novo cadastro',
        row.full_name,
        row.phone,
        null,
        null,
        row.created_at,
      ]),
      ...(data?.first_purchase ?? []).map((row) => [
        'Primeira compra',
        row.full_name,
        row.phone,
        row.receivables_count,
        row.total,
        null,
      ]),
      ...(data?.recurring ?? []).map((row) => [
        'Recorrente',
        row.full_name,
        row.phone,
        row.receivables_count,
        row.total,
        null,
      ]),
    ],
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando coortes…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
        </p>
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={empty} />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando novos e recorrentes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Novos cadastros</div>
            <div className="hub-servicos__metric-value">
              {(summary?.new_clients_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <UserPlus size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Primeira compra</div>
            <div className="hub-servicos__metric-value">
              {(summary?.first_purchase_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Primeiro recebível no período</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ShoppingBag size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Recorrentes</div>
            <div className="hub-servicos__metric-value">
              {(summary?.recurring_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Já compraram antes e voltaram</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <RefreshCw size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total nas coortes</div>
            <div className="hub-servicos__metric-value">
              {totalTouched.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Cadastros + compras do período</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Users size={20} strokeWidth={2} />
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
          {cohortBars.length > 0 ? (
            <section className="hub-relatorios__panel" aria-labelledby="relatorios-cohort-bars-title">
              <div className="hub-relatorios__panel-head">
                <div>
                  <h2 id="relatorios-cohort-bars-title" className="hub-relatorios__section-title">
                    Visão das coortes
                  </h2>
                  <p className="hub-relatorios__panel-sub">Comparativo entre os grupos do período</p>
                </div>
              </div>
              <ul className="hub-relatorios__aging-list">
                {cohortBars.map((row) => (
                  <li key={row.key} className="hub-relatorios__aging-row">
                    <div className="hub-relatorios__aging-meta">
                      <span className="hub-relatorios__aging-label">{row.label}</span>
                      <span className="hub-relatorios__aging-count">
                        {row.count.toLocaleString('pt-BR')}{' '}
                        {row.count === 1 ? 'cliente' : 'clientes'}
                      </span>
                      <strong className="hub-relatorios__aging-value">
                        {totalTouched > 0
                          ? `${((row.count / totalTouched) * 100).toFixed(0)}%`
                          : '—'}
                      </strong>
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

          <section className="hub-relatorios__panel" aria-labelledby="relatorios-cohort-new-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-cohort-new-title" className="hub-relatorios__section-title">
                  Novos cadastros
                </h2>
                <p className="hub-relatorios__panel-sub">Tutores criados no período</p>
              </div>
              <div className="hub-relatorios__panel-stat">
                <span className="hub-relatorios__panel-stat-label">Total</span>
                <span className="hub-relatorios__panel-stat-value">
                  {(data?.new_clients.length ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
            {(data?.new_clients.length ?? 0) === 0 ? (
              <HubRelatoriosEmpty
                title="Nenhum cadastro novo"
                description="Nenhum tutor criado neste período."
              />
            ) : (
              <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
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
                          <Link
                            to={guardianDrillHref(row.guardian_id)}
                            className="hub-finance-page__dash-link"
                          >
                            <span className="hub-relatorios__cell-primary">{row.full_name}</span>
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
          </section>

          <section className="hub-relatorios__panel" aria-labelledby="relatorios-cohort-first-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-cohort-first-title" className="hub-relatorios__section-title">
                  Primeira compra
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Tutores com o primeiro recebível neste período
                </p>
              </div>
              <div className="hub-relatorios__panel-stat">
                <span className="hub-relatorios__panel-stat-label">Total</span>
                <span className="hub-relatorios__panel-stat-value">
                  {(data?.first_purchase.length ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
            {(data?.first_purchase.length ?? 0) === 0 ? (
              <HubRelatoriosEmpty
                title="Nenhuma primeira compra"
                description="Nenhum tutor teve o primeiro recebível neste período."
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
                    {data!.first_purchase.map((row) => (
                      <tr key={row.guardian_id}>
                        <td>
                          <Link
                            to={guardianDrillHref(row.guardian_id)}
                            className="hub-finance-page__dash-link"
                          >
                            <span className="hub-relatorios__cell-primary">{row.full_name}</span>
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
          </section>

          <section className="hub-relatorios__panel" aria-labelledby="relatorios-cohort-recurring-title">
            <div className="hub-relatorios__panel-head">
              <div>
                <h2 id="relatorios-cohort-recurring-title" className="hub-relatorios__section-title">
                  Recorrentes
                </h2>
                <p className="hub-relatorios__panel-sub">
                  Clientes com histórico anterior que compraram de novo
                </p>
              </div>
              <div className="hub-relatorios__panel-stat">
                <span className="hub-relatorios__panel-stat-label">Total</span>
                <span className="hub-relatorios__panel-stat-value">
                  {(data?.recurring.length ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>
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
                          <Link
                            to={guardianDrillHref(row.guardian_id)}
                            className="hub-finance-page__dash-link"
                          >
                            <span className="hub-relatorios__cell-primary">{row.full_name}</span>
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
          </section>
        </>
      )}
    </div>
  );
};

export default HubRelatoriosClientCohorts;
