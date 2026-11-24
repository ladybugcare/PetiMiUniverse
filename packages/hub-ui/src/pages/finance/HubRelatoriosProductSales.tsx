import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Package, Percent, ShoppingBag } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceProductSalesReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

const ITEM_KIND_LABELS: Record<string, string> = {
  product: 'Produto',
  medication: 'Medicamento',
  vaccine: 'Vacina',
};

export const HubRelatoriosProductSales: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:product-sales`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceProductSalesReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getProductSalesReport(clinicId, unitId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar vendas por produto');
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

  const items = data?.items ?? [];
  const mix = data?.mix;
  const summary = data?.summary;
  const marginIncomplete = summary?.margin_complete === false;

  const mixBars = useMemo(() => {
    if (!mix || mix.total <= 0) return [];
    const rows = [
      { key: 'services', label: 'Serviços', total: mix.services, tone: 'ok' },
      { key: 'products', label: 'Produtos', total: mix.products, tone: 'warn' },
      { key: 'other', label: 'Outros', total: mix.other, tone: 'muted' },
    ].filter((r) => r.total > 0);
    const max = Math.max(0, ...rows.map((r) => r.total));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.total / max) * 100 : 0,
      sharePct: mix.total > 0 ? (r.total / mix.total) * 100 : 0,
    }));
  }, [mix]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Vendas por produto',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'vendas-produto',
    headers: [
      'Item',
      'Tipo',
      'Qtd líquida',
      'Receita bruta',
      'Devoluções',
      'Receita líquida',
      'Custo dos produtos vendidos',
      'Margem',
      'Margem %',
      'Margem completa',
    ],
    rows: items.map((row) => [
      row.name,
      ITEM_KIND_LABELS[row.item_kind ?? ''] ?? row.item_kind ?? '—',
      row.quantity,
      row.revenue_gross ?? row.revenue,
      row.returns_commercial ?? 0,
      row.revenue,
      row.cogs,
      row.margin ?? '',
      row.margin_pct ?? '',
      row.margin_complete === false ? 'Não' : 'Sim',
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando vendas por produto…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Data da cobrança / devoluções no período: <strong>{periodLabel}</strong>
          {data?.notes ? (
            <>
              {' '}
              · <span className="hub-clientes__muted">{data.notes}</span>
            </>
          ) : null}
        </p>
        <HubRelatoriosExportButton onClick={onExport} onPdf={onPdf} disabled={items.length === 0} />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando vendas por produto…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Receita líquida</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary?.revenue ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              Bruta {formatBrl(summary?.revenue_gross ?? summary?.revenue ?? 0)} · Devoluções{' '}
              {formatBrl(summary?.returns_commercial ?? 0)}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <ShoppingBag size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Custo dos produtos vendidos</div>
            <div className="hub-servicos__metric-value">{formatBrl(summary?.cogs ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              {(summary?.quantity ?? 0).toLocaleString('pt-BR')} un. líquidas · só custo histórico
            </div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Package size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">
              {marginIncomplete ? 'Margem incompleta' : 'Margem'}
            </div>
            <div className="hub-servicos__metric-value">
              {summary?.margin != null ? formatBrl(summary.margin) : '—'}
            </div>
            <div className="hub-servicos__metric-sub">
              {marginIncomplete
                ? 'Há linhas sem unit_cost_amount registrado'
                : 'Receita líquida − custo dos produtos vendidos'}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Margem %</div>
            <div className="hub-servicos__metric-value">
              {summary?.margin_pct != null
                ? `${summary.margin_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                : '—'}
            </div>
            <div className="hub-servicos__metric-sub">Sobre receita líquida de produtos</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {mixBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-product-mix-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-product-mix-title" className="hub-relatorios__section-title">
                Mix do período
              </h2>
              <p className="hub-relatorios__panel-sub">Receita líquida por tipo de linha (data da cobrança)</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Total</span>
              <span className="hub-relatorios__panel-stat-value">{formatBrl(mix?.total ?? 0)}</span>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {mixBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.sharePct.toFixed(0)}% do total
                  </span>
                  <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                </div>
                <div className="hub-relatorios__aging-bar" aria-hidden>
                  <div
                    className={`hub-relatorios__aging-bar-fill hub-relatorios__aging-bar-fill--${row.tone}`}
                    style={{ width: `${row.widthPct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {items.length === 0 ? (
        <HubRelatoriosEmpty
          title="Nenhuma venda de produto"
          description="Não há linhas de produto nas cobranças deste período (nem devoluções líquidas a exibir)."
        />
      ) : (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-product-sales-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-product-sales-title" className="hub-relatorios__section-title">
                Ranking de produtos
              </h2>
              <p className="hub-relatorios__panel-sub">Ordenado por receita líquida</p>
            </div>
          </div>
          <div className="hub-clientes__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="hub-relatorios__num">Qtd líq.</th>
                  <th className="hub-relatorios__num">Receita líquida</th>
                  <th className="hub-relatorios__num">Devoluções</th>
                  <th className="hub-relatorios__num">Custo</th>
                  <th className="hub-relatorios__num">Margem</th>
                  <th className="hub-relatorios__num">%</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.item_id ?? row.name}>
                    <td>
                      {row.item_id ? (
                        <a
                          className="hub-finance-page__dash-link"
                          href={stockItemDrillHref(row.item_kind, row.name)}
                        >
                          {row.name}
                        </a>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td>{ITEM_KIND_LABELS[row.item_kind ?? ''] ?? row.item_kind ?? '—'}</td>
                    <td className="hub-relatorios__num">{row.quantity.toLocaleString('pt-BR')}</td>
                    <td className="hub-relatorios__num">{formatBrl(row.revenue)}</td>
                    <td className="hub-relatorios__num">
                      {formatBrl(row.returns_commercial ?? 0)}
                    </td>
                    <td className="hub-relatorios__num">{formatBrl(row.cogs)}</td>
                    <td className="hub-relatorios__num">
                      {row.margin_complete === false
                        ? 'Incompleta'
                        : row.margin != null
                          ? formatBrl(row.margin)
                          : '—'}
                    </td>
                    <td className="hub-relatorios__num">
                      {row.margin_pct != null
                        ? `${row.margin_pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default HubRelatoriosProductSales;
