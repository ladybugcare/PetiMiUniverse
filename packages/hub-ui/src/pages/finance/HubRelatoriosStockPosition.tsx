import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Package, PackageX } from 'lucide-react';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { formatBrl } from './hubRelatoriosUtils';

type StockStatus = 'zero' | 'low' | 'ok';

const ITEM_KIND_LABELS: Record<string, string> = {
  product: 'Produto',
  medication: 'Medicamento',
  vaccine: 'Vacina',
};

const STATUS_LABELS: Record<StockStatus, string> = {
  zero: 'Zerado',
  low: 'Abaixo do mínimo',
  ok: 'Ok',
};

function stockStatus(item: HubInventoryItem): StockStatus {
  const qty = Number(item.qty_on_hand ?? 0);
  const min = Number(item.min_stock_qty ?? 0);
  if (qty <= 0) return 'zero';
  if (min > 0 && qty < min) return 'low';
  return 'ok';
}

type HubRelatoriosStockPositionProps = {
  clinicId: string;
};

export const HubRelatoriosStockPosition: React.FC<HubRelatoriosStockPositionProps> = ({ clinicId }) => {
  const { showError } = useAlert();
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(clinicId);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | StockStatus>('all');

  const load = useCallback(async () => {
    begin();
    try {
      const res = await hubInventoryApi.items.list(clinicId);
      const active = (res.items ?? []).filter((i) => i.active && !i.deleted_at);
      active.sort((a, b) => {
        const order: Record<StockStatus, number> = { zero: 0, low: 1, ok: 2 };
        const diff = order[stockStatus(a)] - order[stockStatus(b)];
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
      setItems(active);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar posição de estoque');
    } finally {
      finish();
    }
  }, [clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => stockStatus(i) === filter);
  }, [items, filter]);

  const summary = useMemo(() => {
    let zero = 0;
    let low = 0;
    let ok = 0;
    let valueCost = 0;
    for (const item of items) {
      const st = stockStatus(item);
      if (st === 'zero') zero += 1;
      else if (st === 'low') low += 1;
      else ok += 1;
      valueCost += Number(item.qty_on_hand ?? 0) * Number(item.cost_amount ?? 0);
    }
    return { total: items.length, zero, low, ok, valueCost, alerts: zero + low };
  }, [items]);

  const statusBars = useMemo(() => {
    const rows = [
      { key: 'ok', label: 'Ok', tone: 'ok', count: summary.ok },
      { key: 'low', label: 'Abaixo do mínimo', tone: 'warn', count: summary.low },
      { key: 'zero', label: 'Zerado', tone: 'critical', count: summary.zero },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [summary]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Posição de estoque',
    slug: 'posicao-estoque',
    headers: ['Item', 'SKU', 'Tipo', 'Saldo', 'Mínimo', 'Situação', 'Custo', 'Venda'],
    rows: filtered.map((item) => [
      item.name,
      item.store_sku,
      ITEM_KIND_LABELS[item.item_kind] ?? item.item_kind,
      Number(item.qty_on_hand ?? 0),
      Number(item.min_stock_qty ?? 0),
      STATUS_LABELS[stockStatus(item)],
      Number(item.cost_amount ?? 0),
      Number(item.sale_amount ?? 0),
    ]),
    showError,
  });

  if (loading && items.length === 0) {
    return <HubLoading variant="block" label="Carregando estoque…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Saldo atual dos itens ativos ·{' '}
          <Link to="/hub/estoque/alertas" className="hub-finance-page__dash-link">
            Ver alertas de validade e mínimo
          </Link>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={filtered.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando posição de estoque…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens ativos</div>
            <div className="hub-servicos__metric-value">{summary.total.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">
              {summary.ok.toLocaleString('pt-BR')} em situação ok
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Package size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Abaixo do mínimo</div>
            <div className="hub-servicos__metric-value">{summary.low.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Reposição recomendada</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${summary.low > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <AlertTriangle size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Zerados</div>
            <div className="hub-servicos__metric-value">{summary.zero.toLocaleString('pt-BR')}</div>
            <div className="hub-servicos__metric-sub">Sem saldo disponível</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${summary.zero > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <PackageX size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor em custo</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.valueCost)}</div>
            <div className="hub-servicos__metric-sub">Estimativa saldo × custo</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <CheckCircle2 size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {statusBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-stock-status-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-stock-status-title" className="hub-relatorios__section-title">
                Situação do estoque
              </h2>
              <p className="hub-relatorios__panel-sub">Distribuição dos itens ativos por status</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Atenção</span>
              <span className="hub-relatorios__panel-stat-value">
                {summary.alerts.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {statusBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} {row.count === 1 ? 'item' : 'itens'}
                  </span>
                  <strong className="hub-relatorios__aging-value">
                    {summary.total > 0
                      ? `${((row.count / summary.total) * 100).toFixed(0)}%`
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-stock-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-stock-list-title" className="hub-relatorios__section-title">
              Itens
            </h2>
            <p className="hub-relatorios__panel-sub">Filtre por situação para focar na reposição</p>
          </div>
          <div className="hub-dayboard__filter-group" role="group" aria-label="Filtrar situação">
            {(
              [
                ['all', 'Todos'],
                ['low', 'Baixo'],
                ['zero', 'Zerado'],
                ['ok', 'Ok'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`hub-dayboard__filter-btn${filter === value ? ' hub-dayboard__filter-btn--active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum item"
            description="Nenhum item encontrado para o filtro de situação selecionado."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="hub-finance-page__th-num">Saldo</th>
                  <th className="hub-finance-page__th-num">Mínimo</th>
                  <th>Situação</th>
                  <th className="hub-finance-page__th-num">Custo unit.</th>
                  <th className="hub-finance-page__th-num">Venda unit.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const st = stockStatus(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link
                          to={stockItemDrillHref(item.item_kind, item.name)}
                          className="hub-finance-page__dash-link"
                        >
                          <span className="hub-relatorios__cell-primary">{item.name}</span>
                        </Link>
                        {item.store_sku ? (
                          <div className="hub-relatorios__cell-meta">SKU {item.store_sku}</div>
                        ) : null}
                      </td>
                      <td>{ITEM_KIND_LABELS[item.item_kind] ?? item.item_kind}</td>
                      <td className="hub-finance-page__td-num">
                        {Number(item.qty_on_hand ?? 0).toLocaleString('pt-BR')}
                      </td>
                      <td className="hub-finance-page__td-num">
                        {Number(item.min_stock_qty ?? 0).toLocaleString('pt-BR')}
                      </td>
                      <td>
                        <span
                          className={`hub-clientes__pill${
                            st === 'low' || st === 'zero' ? ' hub-finance-page__pill--warning' : ''
                          }`}
                        >
                          {STATUS_LABELS[st]}
                        </span>
                      </td>
                      <td className="hub-finance-page__td-num">
                        {formatBrl(Number(item.cost_amount ?? 0))}
                      </td>
                      <td className="hub-finance-page__td-num">
                        {formatBrl(Number(item.sale_amount ?? 0))}
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

export default HubRelatoriosStockPosition;
