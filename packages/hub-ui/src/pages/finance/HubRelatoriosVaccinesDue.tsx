import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Syringe, Users } from 'lucide-react';
import {
  hubFinancialApi,
  type HubVaccinesDueReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref, petDrillHref } from './hubRelatoriosLinks';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; days: number };

export const HubRelatoriosVaccinesDue: React.FC<Props> = ({ clinicId, days }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${days}:vaccines-due`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubVaccinesDueReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getVaccinesDueReport(clinicId, { days }));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar vacinas a vencer');
    } finally {
      finish();
    }
  }, [clinicId, days, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const total = data?.summary.total ?? 0;
  const overdue = data?.summary.overdue ?? 0;
  const upcoming = data?.summary.upcoming ?? 0;
  const uniquePets = useMemo(
    () => new Set(items.map((row) => row.pet_id)).size,
    [items],
  );

  const statusBars = useMemo(() => {
    const rows = [
      { key: 'overdue', label: 'Vencidas', count: overdue, tone: 'risk' as const },
      { key: 'upcoming', label: 'A vencer', count: upcoming, tone: 'ok' as const },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [overdue, upcoming]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Vacinas a vencer',
    subtitle: `Vencidas + próximos ${days} dias`,
    slug: 'vacinas-a-vencer',
    headers: [
      'Pet',
      'Vacina',
      'Próxima dose',
      'Em (dias)',
      'Vencida',
      'Tutor',
      'Telefone',
      'Última aplicação',
    ],
    rows: items.map((row) => [
      row.pet_name,
      row.vaccine_name,
      row.next_dose_at,
      row.days_until,
      row.overdue ? 'Sim' : 'Não',
      row.guardian_name,
      row.phone,
      row.administered_at,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando vacinas…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Janela: <strong>vencencidas + próximos {days} dias</strong>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando vacinas…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Total</div>
            <div className="hub-servicos__metric-value">{total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Vencidas + próximos {days} dias</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Syringe size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vencidas</div>
            <div className="hub-servicos__metric-value">{overdue.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Precisam de retorno</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${overdue > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">A vencer</div>
            <div className="hub-servicos__metric-value">{upcoming.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Dentro da janela</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${upcoming > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <CalendarClock size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Pets</div>
            <div className="hub-servicos__metric-value">{uniquePets.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Com dose pendente</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {statusBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-vaccines-status-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-vaccines-status-title" className="hub-relatorios__section-title">
                Situação das doses
              </h2>
              <p className="hub-relatorios__panel-sub">
                Comparativo entre vacinas vencidas e as que vencem na janela
              </p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {statusBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')}
                  </span>
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-vaccines-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-vaccines-list-title" className="hub-relatorios__section-title">
              Próximas doses
            </h2>
            <p className="hub-relatorios__panel-sub">
              Vacinas vencidas ou a vencer, com contato do tutor
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Registros</span>
            <span className="hub-relatorios__panel-stat-value">
              {items.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
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
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={petDrillHref(row.pet_id)} className="hub-finance-page__dash-link">
                        <span className="hub-relatorios__cell-primary">{row.pet_name}</span>
                      </Link>
                      {row.species ? (
                        <div className="hub-relatorios__cell-meta">{row.species}</div>
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
                        <Link
                          to={guardianDrillHref(row.guardian_id)}
                          className="hub-finance-page__dash-link"
                        >
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
      </section>
    </div>
  );
};

export default HubRelatoriosVaccinesDue;
