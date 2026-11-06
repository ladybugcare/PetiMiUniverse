import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Layers } from 'lucide-react';
import { hubInventoryApi, type HubInventoryMovementsReport } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type HubRelatoriosStockMovementsProps = {
  clinicId: string;
  period: HubReportPeriod;
};

const TYPE_TONES = ['risk', 'ok', 'warn', 'muted', 'critical'] as const;

export const HubRelatoriosStockMovements: React.FC<HubRelatoriosStockMovementsProps> = ({
  clinicId,
  period,
}) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:stock-movements`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubInventoryMovementsReport | null>(null);
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubInventoryApi.reports.movements(clinicId, {
        ...periodToApiOpts(period),
        direction,
      });
      setData(res);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar entradas e saídas');
    } finally {
      finish();
    }
  }, [clinicId, period, direction, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const byTypeRows = useMemo(() => {
    const entries = Object.entries(data?.summary.by_type ?? {});
    const maxQty = Math.max(0, ...entries.map(([, v]) => Math.abs(v.qty)));
    return entries
      .map(([type, value], i) => ({
        key: type,
        label: value.label,
        count: value.count,
        qty: value.qty,
        tone: TYPE_TONES[i % TYPE_TONES.length],
        widthPct: maxQty > 0 ? (Math.abs(value.qty) / maxQty) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty));
  }, [data]);

  const netQty = (data?.summary.qty_in ?? 0) - (data?.summary.qty_out ?? 0);
  const items = data?.items ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Entradas e saídas',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'estoque-movimentos',
    headers: ['Data', 'Item', 'Tipo', 'Direção', 'Qtd', 'Custo', 'Obs'],
    rows: items.map((row) => [
      row.created_at,
      row.item_name,
      row.movement_label,
      row.direction === 'in' ? 'Entrada' : row.direction === 'out' ? 'Saída' : row.direction,
      row.qty,
      row.unit_cost,
      row.notes,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando movimentações…" />;
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

      <HubRefreshingBanner show={refreshing} label="Atualizando entradas e saídas…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Movimentos</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.movements_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ArrowLeftRight size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Qtd. entradas</div>
            <div className="hub-servicos__metric-value hub-relatorios__metric-value--pos">
              {(data?.summary.qty_in ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Compras, ajustes positivos etc.</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ArrowDownLeft size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Qtd. saídas</div>
            <div className="hub-servicos__metric-value hub-relatorios__metric-value--neg">
              {(data?.summary.qty_out ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Vendas, consumo e baixas</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.qty_out ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <ArrowUpRight size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Saldo líquido</div>
            <div
              className={`hub-servicos__metric-value${
                netQty < 0
                  ? ' hub-relatorios__metric-value--neg'
                  : netQty > 0
                    ? ' hub-relatorios__metric-value--pos'
                    : ''
              }`}
            >
              {netQty > 0 ? '+' : ''}
              {netQty.toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Entradas − saídas</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Layers size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-stock-mov-types-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-stock-mov-types-title" className="hub-relatorios__section-title">
              Por tipo de movimento
            </h2>
            <p className="hub-relatorios__panel-sub">Quantidade agregada por natureza do lançamento</p>
          </div>
          <div className="hub-dayboard__filter-group" role="group" aria-label="Direção">
            {(
              [
                ['all', 'Todos'],
                ['in', 'Entradas'],
                ['out', 'Saídas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`hub-dayboard__filter-btn${direction === value ? ' hub-dayboard__filter-btn--active' : ''}`}
                onClick={() => setDirection(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {byTypeRows.length === 0 ? (
          <HubRelatoriosEmpty
            title="Sem movimentos"
            description="Não há entradas ou saídas no período."
          />
        ) : (
          <ul className="hub-relatorios__aging-list">
            {byTypeRows.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} mov.
                  </span>
                  <strong className="hub-relatorios__aging-value">
                    {row.qty.toLocaleString('pt-BR')}
                  </strong>
                </div>
                <div className="hub-relatorios__aging-track" aria-hidden>
                  <span
                    className={`hub-relatorios__aging-fill hub-relatorios__aging-fill--${row.tone}`}
                    style={{ width: `${Math.max(row.widthPct, row.qty !== 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-stock-mov-detail-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-stock-mov-detail-title" className="hub-relatorios__section-title">
              Detalhe
            </h2>
            <p className="hub-relatorios__panel-sub">Lançamentos do período com o filtro atual</p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Linhas</span>
            <span className="hub-relatorios__panel-stat-value">
              {items.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma movimentação"
            description="Ajuste o período ou o filtro de direção."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="hub-finance-page__th-num">Qtd.</th>
                  <th className="hub-finance-page__th-num">Custo unit.</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateBr(row.created_at)}</td>
                    <td>
                      <Link
                        to={stockItemDrillHref(row.item_kind, row.item_name)}
                        className="hub-finance-page__dash-link"
                      >
                        <span className="hub-relatorios__cell-primary">{row.item_name}</span>
                      </Link>
                    </td>
                    <td>
                      <span className="hub-relatorios__type-pill">{row.movement_label}</span>
                    </td>
                    <td
                      className={`hub-finance-page__td-num${
                        row.direction === 'in'
                          ? ' hub-relatorios__td-num--pos'
                          : row.direction === 'out'
                            ? ' hub-relatorios__td-num--neg'
                            : ''
                      }`}
                    >
                      {row.direction === 'out' ? '−' : row.direction === 'in' ? '+' : ''}
                      {row.qty.toLocaleString('pt-BR')}
                      {row.unit_label ? ` ${row.unit_label}` : ''}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.unit_cost != null ? formatBrl(row.unit_cost) : '—'}
                    </td>
                    <td>{row.notes?.trim() || '—'}</td>
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

export default HubRelatoriosStockMovements;
