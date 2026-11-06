import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Percent, UserMinus, UserX, Users } from 'lucide-react';
import { hubFinancialApi, type HubAbsentClientsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
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
  const resourceKey = `${clinicId}:${unitId ?? 'all'}:${days}:absent`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubAbsentClientsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubFinancialApi.getAbsentClientsReport(clinicId, {
        days,
        unit_id: unitId,
      });
      setData(res);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar clientes ausentes');
    } finally {
      finish();
    }
  }, [clinicId, unitId, days, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const scanned = data?.summary.active_guardians_scanned ?? 0;
  const absentRate = scanned > 0 ? ((data?.summary.absent_count ?? 0) / scanned) * 100 : 0;

  const sourceBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      if (row.never_attended) {
        map.set('never', (map.get('never') ?? 0) + 1);
        continue;
      }
      const key = row.last_activity_source ?? 'unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const rows = [...map.entries()].map(([key, count]) => ({
      key,
      label:
        key === 'never'
          ? 'Nunca atendido'
          : key === 'unknown'
            ? 'Sem origem'
            : SOURCE_LABELS[key] ?? key,
      count,
      tone: key === 'never' ? 'critical' : key === 'appointment' ? 'ok' : 'warn',
    }));
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows
      .map((r) => ({ ...r, widthPct: max > 0 ? (r.count / max) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Clientes ausentes',
    subtitle: `≥ ${days} dias`,
    slug: 'clientes-ausentes',
    headers: ['Cliente', 'Telefone', 'E-mail', 'Última atividade', 'Origem', 'Dias ausente', 'Nunca atendido'],
    rows: items.map((row) => [
      row.full_name,
      row.phone,
      row.email,
      row.last_activity_at,
      row.last_activity_source
        ? SOURCE_LABELS[row.last_activity_source] ?? row.last_activity_source
        : null,
      row.days_absent,
      row.never_attended ? 'sim' : 'não',
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando clientes ausentes…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Critério: <strong>≥ {days} dias</strong> sem atividade
          {data?.cutoff ? (
            <>
              {' '}
              · corte {formatDateBr(data.cutoff)}
            </>
          ) : null}
          {unitId ? ' · filtro de unidade aplicado' : ''}
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando clientes ausentes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ausentes</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.absent_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">≥ {days} dias sem atividade</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.absent_count ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <UserMinus size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Nunca atendidos</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.never_attended_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Sem agendamento ou cobrança</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.never_attended_count ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <UserX size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ativos analisados</div>
            <div className="hub-servicos__metric-value">
              {scanned.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Base de tutores ativos</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa de ausência</div>
            <div className="hub-servicos__metric-value">{absentRate.toFixed(1)}%</div>
            <div className="hub-servicos__metric-sub">Ausentes ÷ ativos analisados</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {sourceBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-absent-sources-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-absent-sources-title" className="hub-relatorios__section-title">
                Última origem de atividade
              </h2>
              <p className="hub-relatorios__panel-sub">
                Como a última interação foi registrada antes da ausência
              </p>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {sourceBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')}{' '}
                    {row.count === 1 ? 'cliente' : 'clientes'}
                  </span>
                  <strong className="hub-relatorios__aging-value">
                    {items.length > 0
                      ? `${((row.count / items.length) * 100).toFixed(0)}%`
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-absent-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-absent-list-title" className="hub-relatorios__section-title">
              Lista de ausentes
            </h2>
            <p className="hub-relatorios__panel-sub">
              Considera última atividade em agendamento (não cancelado) ou recebível. Lista limitada a
              500 resultados.
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Exibindo</span>
            <span className="hub-relatorios__panel-stat-value">
              {items.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
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
                {items.map((row) => (
                  <tr key={row.guardian_id}>
                    <td>
                      <Link
                        to={`/hub/clientes/${row.guardian_id}`}
                        className="hub-finance-page__dash-link"
                      >
                        <span className="hub-relatorios__cell-primary">{row.full_name}</span>
                      </Link>
                    </td>
                    <td>{row.phone || '—'}</td>
                    <td>
                      {row.never_attended ? (
                        <span className="hub-clientes__pill hub-finance-page__pill--warning">
                          Nunca
                        </span>
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
                      {row.days_absent != null ? row.days_absent.toLocaleString('pt-BR') : '—'}
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

export default HubRelatoriosAbsentClients;
