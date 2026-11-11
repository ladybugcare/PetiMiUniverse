import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CircleDollarSign, FilePlus2, FileWarning, Layers } from 'lucide-react';
import { usePermissions } from '@petimi/web-core';
import {
  hubFinancialApi,
  type HubFinanceUnbilledItem,
  type HubFinanceUnbilledSourceType,
} from '../../api/hubFinancialApi';
import { hubComandaApi, type HubComandaOriginType } from '../../api/hubComandaApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { caixaSemComandaHref, guardianDrillHref } from './hubRelatoriosLinks';
import { defaultRangeForPreset, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';
import { operationalStatusLabel } from './FinanceDayBoardTable';

const SOURCE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  appointment: 'Agendamento',
  encounter: 'Atendimento',
  grooming_session: 'Banho e tosa',
  boarding_reservation: 'Hotel & Creche',
  hospitalization: 'Internação',
};

const SOURCE_TONE: Record<string, string> = {
  quote: 'muted',
  appointment: 'ok',
  encounter: 'warn',
  grooming_session: 'risk',
  boarding_reservation: 'critical',
  hospitalization: 'warn',
};

const OPENABLE_ORIGINS = new Set<HubFinanceUnbilledSourceType>([
  'appointment',
  'grooming_session',
  'encounter',
  'boarding_reservation',
  'quote',
  'hospitalization',
]);

function resolveUnbilledComandaOrigin(row: HubFinanceUnbilledItem): {
  origin_type: HubComandaOriginType;
  origin_id: string;
} | null {
  if (row.source_type === 'hospitalization') {
    if (row.billing_origin_type && row.billing_origin_id) {
      return {
        origin_type: row.billing_origin_type,
        origin_id: row.billing_origin_id,
      };
    }
    return null;
  }
  if (!OPENABLE_ORIGINS.has(row.source_type)) return null;
  return {
    origin_type: row.source_type as HubComandaOriginType,
    origin_id: row.source_id,
  };
}

type Props = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

function periodBounds(period: HubReportPeriod): { from: string; to: string } {
  if (period.mode === 'range') return { from: period.from, to: period.to };
  return defaultRangeForPreset(period.days);
}

export const HubRelatoriosUnbilled: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:unbilled`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [items, setItems] = useState<HubFinanceUnbilledItem[]>([]);

  const canOpenComanda = hasPermission('hub.receivables.create');

  const load = useCallback(async () => {
    begin();
    try {
      setItems(await hubFinancialApi.listUnbilledCompleted(clinicId, unitId));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar cobranças não geradas');
    } finally {
      finish();
    }
  }, [clinicId, unitId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const bounds = useMemo(() => periodBounds(period), [period]);
  const periodLabel = `${formatDateBr(bounds.from)} a ${formatDateBr(bounds.to)}`;

  const filtered = useMemo(() => {
    return items.filter((it) => {
      const at = it.completed_at?.slice(0, 10);
      if (!at) return true;
      return at >= bounds.from && at <= bounds.to;
    });
  }, [items, bounds]);

  const totals = useMemo(() => {
    let totalEst = 0;
    const guardians = new Set<string>();
    const sources = new Set<string>();
    for (const it of filtered) {
      totalEst += Number(it.estimated_amount || 0);
      if (it.guardian?.id) guardians.add(it.guardian.id);
      sources.add(it.source_type);
    }
    return {
      count: filtered.length,
      totalEst,
      guardians: guardians.size,
      sources: sources.size,
      avg: filtered.length > 0 ? totalEst / filtered.length : 0,
    };
  }, [filtered]);

  const bySource = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const it of filtered) {
      const cur = map.get(it.source_type) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(it.estimated_amount || 0);
      map.set(it.source_type, cur);
    }
    const maxTotal = Math.max(0, ...[...map.values()].map((v) => v.total));
    return [...map.entries()]
      .map(([key, value]) => ({
        key,
        label: SOURCE_LABELS[key] ?? key,
        tone: SOURCE_TONE[key] ?? 'muted',
        count: value.count,
        total: value.total,
        widthPct: maxTotal > 0 ? (value.total / maxTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const openComandaForRow = useCallback(
    async (row: HubFinanceUnbilledItem) => {
      const origin = resolveUnbilledComandaOrigin(row);
      if (!origin) {
        navigate(caixaSemComandaHref(row.completed_at));
        return;
      }
      if (!canOpenComanda) {
        showError('Sem permissão para abrir comanda. Use o Caixa com o filtro “Sem comanda”.');
        navigate(caixaSemComandaHref(row.completed_at));
        return;
      }

      const key = `${row.source_type}:${row.source_id}`;
      setOpeningKey(key);
      try {
        const detail = await hubComandaApi.openComanda({
          clinic_id: clinicId,
          origin_type: origin.origin_type,
          origin_id: origin.origin_id,
          unit_id: unitId,
        });
        const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
        showSuccess('Comanda aberta.');
        if (comandaId) {
          navigate(`/hub/caixa/comanda/${comandaId}`);
        } else {
          navigate(caixaSemComandaHref(row.completed_at));
        }
      } catch (e: unknown) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Já existe comanda aberta')) {
          try {
            const existing = await hubComandaApi.getComandaByOrigin({
              clinic_id: clinicId,
              origin_type: origin.origin_type,
              origin_id: origin.origin_id,
            });
            const comandaId = (existing.comanda as Record<string, unknown> | undefined)?.id as
              | string
              | undefined;
            if (comandaId) {
              navigate(`/hub/caixa/comanda/${comandaId}`);
              return;
            }
          } catch {
            /* fall through */
          }
          showError('Já existe uma comanda aberta. Abrindo o Caixa filtrado.');
          navigate(caixaSemComandaHref(row.completed_at));
        } else {
          showError(msg || 'Erro ao abrir comanda');
        }
      } finally {
        setOpeningKey(null);
      }
    },
    [canOpenComanda, clinicId, navigate, showError, showSuccess, unitId],
  );

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Cobrança não gerada',
    subtitle: periodLabel,
    slug: 'cobranca-nao-gerada',
    headers: ['Conclusão', 'Origem', 'Cliente', 'Pet', 'Status', 'Estimativa'],
    rows: filtered.map((row) => [
      row.completed_at,
      SOURCE_LABELS[row.source_type] ?? row.source_type,
      row.guardian?.full_name ?? null,
      row.pet?.name ?? null,
      operationalStatusLabel(row.operational_status || '', 'financeiro'),
      row.estimated_amount,
    ]),
    showError,
  });

  if (loading && items.length === 0) {
    return <HubLoading variant="block" label="Carregando cobranças não geradas…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
          {' · '}
          <Link to={caixaSemComandaHref()} className="hub-finance-page__dash-link">
            Abrir no Caixa (sem comanda)
          </Link>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={filtered.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando cobranças não geradas…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens sem cobrança</div>
            <div className="hub-servicos__metric-value">{totals.count.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${totals.count > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <FileWarning size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Estimativa</div>
            <div className="hub-servicos__metric-value">{formatBrl(totals.totalEst)}</div>
            <div className="hub-servicos__metric-sub">Soma dos valores estimados</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Clientes afetados</div>
            <div className="hub-servicos__metric-value">
              {totals.guardians.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Tutores com serviço concluído sem cobrança</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${totals.guardians > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Ticket estimado</div>
            <div className="hub-servicos__metric-value">{formatBrl(totals.avg)}</div>
            <div className="hub-servicos__metric-sub">
              {totals.sources.toLocaleString('pt-BR')}{' '}
              {totals.sources === 1 ? 'origem' : 'origens'}
            </div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Layers size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-unbilled-sources-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-unbilled-sources-title" className="hub-relatorios__section-title">
              Por origem
            </h2>
            <p className="hub-relatorios__panel-sub">
              Distribuição da estimativa por tipo de serviço concluído
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Estimativa</span>
            <span className="hub-relatorios__panel-stat-value">{formatBrl(totals.totalEst)}</span>
          </div>
        </div>
        {bySource.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nada pendente de cobrança"
            description="Não há serviços concluídos sem recebível no período filtrado."
          />
        ) : (
          <ul className="hub-relatorios__aging-list">
            {bySource.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} {row.count === 1 ? 'item' : 'itens'}
                  </span>
                  <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                    style={{ width: `${Math.max(row.widthPct, row.total > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-unbilled-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-unbilled-list-title" className="hub-relatorios__section-title">
              Itens para faturar
            </h2>
            <p className="hub-relatorios__panel-sub">
              Clique na linha ou no ícone para abrir a comanda e faturar.
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Itens</span>
            <span className="hub-relatorios__panel-stat-value">
              {filtered.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nada pendente de cobrança"
            description="Não há serviços concluídos sem recebível no período filtrado."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
              <thead>
                <tr>
                  <th>Conclusão</th>
                  <th>Origem</th>
                  <th>Cliente</th>
                  <th>Pet</th>
                  <th>Status</th>
                  <th className="hub-finance-page__th-num">Estimativa</th>
                  <th className="hub-clientes__th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const rowKey = `${row.source_type}:${row.source_id}`;
                  const busy = openingKey === rowKey;
                  return (
                    <tr
                      key={rowKey}
                      tabIndex={0}
                      className="hub-relatorios__row-link"
                      aria-label={`Abrir comanda de ${row.guardian?.full_name ?? row.origin_label}`}
                      onClick={() => {
                        if (!openingKey) void openComandaForRow(row);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !openingKey) {
                          e.preventDefault();
                          void openComandaForRow(row);
                        }
                      }}
                    >
                      <td>{formatDateBr(row.completed_at)}</td>
                      <td>
                        <div className="hub-relatorios__cell-primary">
                          {SOURCE_LABELS[row.source_type] ?? row.source_type}
                        </div>
                        <div className="hub-relatorios__cell-meta">{row.origin_label}</div>
                      </td>
                      <td>
                        {row.guardian?.id ? (
                          <Link
                            to={guardianDrillHref(row.guardian.id)}
                            className="hub-finance-page__dash-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.guardian.full_name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{row.pet?.name ?? '—'}</td>
                      <td>
                        {row.operational_status ? (
                          <span
                            className={`hub-dayboard__op-badge hub-dayboard__op-badge--${row.operational_status}`}
                          >
                            {operationalStatusLabel(row.operational_status, 'financeiro')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hub-finance-page__td-num">
                        {formatBrl(row.estimated_amount)}
                      </td>
                      <td
                        className="hub-clientes__td-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title={busy ? 'Abrindo…' : 'Abrir comanda'}
                            aria-label={`Abrir comanda de ${row.guardian?.full_name ?? row.origin_label}`}
                            disabled={!!openingKey}
                            onClick={() => void openComandaForRow(row)}
                          >
                            <FilePlus2 size={15} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default HubRelatoriosUnbilled;
