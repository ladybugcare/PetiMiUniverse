import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
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
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | StockStatus>('all');

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar posição de estoque');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

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
    return { total: items.length, zero, low, ok, valueCost };
  }, [items]);

  if (loading) return <HubLoading variant="block" label="Carregando estoque…" />;

  const onExport = () => {
    downloadCsv(
      reportCsvFilename('posicao-estoque'),
      ['Item', 'SKU', 'Tipo', 'Saldo', 'Mínimo', 'Situação', 'Custo', 'Venda'],
      filtered.map((item) => [
        item.name,
        item.store_sku,
        ITEM_KIND_LABELS[item.item_kind] ?? item.item_kind,
        Number(item.qty_on_hand ?? 0),
        Number(item.min_stock_qty ?? 0),
        STATUS_LABELS[stockStatus(item)],
        Number(item.cost_amount ?? 0),
        Number(item.sale_amount ?? 0),
      ])
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={filtered.length === 0} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens ativos</div>
            <div className="hub-servicos__metric-value">{summary.total}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Abaixo do mínimo</div>
            <div className="hub-servicos__metric-value">{summary.low}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Zerados</div>
            <div className="hub-servicos__metric-value">{summary.zero}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor em custo (estimado)</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary.valueCost)}</div>
          </div>
        </div>
      </div>

      <div className="hub-clientes__toolbar hub-relatorios__toolbar">
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
        <Link to="/hub/estoque/alertas" className="hub-finance-page__dash-link hub-relatorios__alerts-link">
          Ver alertas de validade e mínimo →
        </Link>
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
                        {item.name}
                      </Link>
                      {item.store_sku ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          SKU {item.store_sku}
                        </div>
                      ) : null}
                    </td>
                    <td>{ITEM_KIND_LABELS[item.item_kind] ?? item.item_kind}</td>
                    <td className="hub-finance-page__td-num">{Number(item.qty_on_hand ?? 0)}</td>
                    <td className="hub-finance-page__td-num">{Number(item.min_stock_qty ?? 0)}</td>
                    <td>
                      <span
                        className={`hub-clientes__pill${
                          st === 'low' || st === 'zero' ? ' hub-finance-page__pill--warning' : ''
                        }`}
                      >
                        {STATUS_LABELS[st]}
                      </span>
                    </td>
                    <td className="hub-finance-page__td-num">{formatBrl(Number(item.cost_amount ?? 0))}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(Number(item.sale_amount ?? 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosStockPosition;
