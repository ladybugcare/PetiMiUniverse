import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CircleDollarSign, Receipt } from 'lucide-react';
import { hubFinancialApi, type HubFinanceReceivable } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { guardianDrillHref, receivableDrillHref } from './hubRelatoriosLinks';
import { daysOverdue, formatBrl, formatDateBr } from './hubRelatoriosUtils';
import { formatReceivableListTitle } from './comandaListPreview';
import { ReceivableDueBadge } from './ReceivableDueBadge';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
};

type PendingRow = HubFinanceReceivable & { overdue_days: number | null };

type AgingBucket = {
  key: string;
  label: string;
  tone: string;
  count: number;
  total: number;
  widthPct: number;
};

type HubRelatoriosPendingPaymentsProps = {
  clinicId: string;
  unitId: string;
};

function bucketForOverdue(days: number | null): AgingBucket['key'] {
  if (days == null) return 'not_due';
  if (days <= 30) return 'overdue_1_30';
  if (days <= 60) return 'overdue_31_60';
  return 'overdue_61_plus';
}

const BUCKET_META: Record<string, { label: string; tone: string }> = {
  not_due: { label: 'A vencer / sem atraso', tone: 'ok' },
  overdue_1_30: { label: 'Vencidos 1–30 dias', tone: 'warn' },
  overdue_31_60: { label: 'Vencidos 31–60 dias', tone: 'risk' },
  overdue_61_plus: { label: 'Vencidos 61+ dias', tone: 'critical' },
};

const BUCKET_ORDER = ['not_due', 'overdue_1_30', 'overdue_31_60', 'overdue_61_plus'] as const;

export const HubRelatoriosPendingPayments: React.FC<HubRelatoriosPendingPaymentsProps> = ({
  clinicId,
  unitId,
}) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const resourceKey = `${clinicId}:${unitId}:pending-payments`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [rows, setRows] = useState<PendingRow[]>([]);

  const load = useCallback(async () => {
    begin();
    try {
      const [pending, partial] = await Promise.all([
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId, status: 'pending' }),
        hubFinancialApi.listReceivables(clinicId, { unit_id: unitId, status: 'partially_paid' }),
      ]);
      const merged = [...pending, ...partial].map((r) => ({
        ...r,
        overdue_days: daysOverdue(r.due_date),
      }));
      merged.sort((a, b) => {
        const aOver = a.overdue_days ?? -1;
        const bOver = b.overdue_days ?? -1;
        if (aOver !== bOver) return bOver - aOver;
        return Number(b.final_amount) - Number(a.final_amount);
      });
      setRows(merged);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar pagamentos pendentes');
    } finally {
      finish();
    }
  }, [clinicId, unitId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let total = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    let partialCount = 0;
    for (const r of rows) {
      const amount = Number(r.final_amount ?? 0);
      total += amount;
      if (r.overdue_days != null) {
        overdueCount += 1;
        overdueTotal += amount;
      }
      if (r.status === 'partially_paid') partialCount += 1;
    }
    return {
      count: rows.length,
      total,
      overdueCount,
      overdueTotal,
      partialCount,
      pendingCount: rows.length - partialCount,
    };
  }, [rows]);

  const agingBuckets = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const key of BUCKET_ORDER) map.set(key, { count: 0, total: 0 });
    for (const r of rows) {
      const key = bucketForOverdue(r.overdue_days);
      const cur = map.get(key) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.final_amount ?? 0);
      map.set(key, cur);
    }
    const maxTotal = Math.max(0, ...[...map.values()].map((v) => v.total));
    return BUCKET_ORDER.map((key) => {
      const value = map.get(key) ?? { count: 0, total: 0 };
      return {
        key,
        label: BUCKET_META[key].label,
        tone: BUCKET_META[key].tone,
        count: value.count,
        total: value.total,
        widthPct: maxTotal > 0 ? (value.total / maxTotal) * 100 : 0,
      } satisfies AgingBucket;
    }).filter((b) => b.count > 0);
  }, [rows]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Pagamentos pendentes',
    slug: 'pagamentos-pendentes',
    headers: ['Cliente', 'Serviços', 'Status', 'Vencimento', 'Dias atraso', 'Valor'],
    rows: rows.map((r) => [
      r.guardian?.full_name,
      formatReceivableListTitle(r),
      STATUS_LABELS[r.status] ?? r.status,
      r.due_date,
      r.overdue_days,
      Number(r.final_amount ?? 0),
    ]),
    showError,
  });

  if (loading && rows.length === 0) {
    return <HubLoading variant="block" label="Carregando pagamentos pendentes…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Receba no{' '}
          <Link to="/hub/caixa" className="hub-finance-page__dash-link">
            Caixa
          </Link>{' '}
          ou no{' '}
          <Link to="/hub/financeiro" className="hub-finance-page__dash-link">
            Financeiro
          </Link>
          . Lista limitada aos 200 mais recentes por status.
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={rows.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando pagamentos pendentes…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Em aberto</div>
            <div className="hub-servicos__metric-value">{totals.count.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">
              {totals.pendingCount.toLocaleString('pt-BR')} pendentes ·{' '}
              {totals.partialCount.toLocaleString('pt-BR')} parciais
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor em aberto</div>
            <div className="hub-servicos__metric-value">{formatBrl(totals.total)}</div>
            <div className="hub-servicos__metric-sub">Pendentes e parciais</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vencidos</div>
            <div className="hub-servicos__metric-value">
              {totals.overdueCount.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{formatBrl(totals.overdueTotal)}</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${totals.overdueCount > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">A vencer</div>
            <div className="hub-servicos__metric-value">
              {(totals.count - totals.overdueCount).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">
              {formatBrl(totals.total - totals.overdueTotal)}
            </div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Clock size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {agingBuckets.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-pending-aging-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-pending-aging-title" className="hub-relatorios__section-title">
                Faixas de atraso
              </h2>
              <p className="hub-relatorios__panel-sub">
                Distribuição do valor em aberto por situação de vencimento.
              </p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Total em aberto</span>
              <span className="hub-relatorios__panel-stat-value">{formatBrl(totals.total)}</span>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {agingBuckets.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} {row.count === 1 ? 'título' : 'títulos'}
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
        </section>
      ) : null}

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-pending-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-pending-list-title" className="hub-relatorios__section-title">
              Lista de recebíveis
            </h2>
            <p className="hub-relatorios__panel-sub">
              Ordenada por atraso e valor. Clique na linha para abrir o recebível.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum pagamento pendente"
            description="Não há recebíveis pendentes ou parciais nesta unidade."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Serviços</th>
                  <th>Status / Vencimento</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className="hub-relatorios__row-link"
                    onClick={() => navigate(receivableDrillHref(row.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(receivableDrillHref(row.id));
                      }
                    }}
                  >
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
                    <td>
                      <div className="hub-relatorios__cell-primary">
                        {formatReceivableListTitle(row)}
                      </div>
                      {row.due_date ? (
                        <div className="hub-relatorios__cell-meta">
                          Venc. {formatDateBr(row.due_date)}
                          {row.overdue_days != null
                            ? ` · ${row.overdue_days}d atraso`
                            : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <ReceivableDueBadge dueDate={row.due_date} status={row.status} />
                    </td>
                    <td className="hub-finance-page__td-num">
                      {formatBrl(Number(row.final_amount ?? 0))}
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

export default HubRelatoriosPendingPayments;
