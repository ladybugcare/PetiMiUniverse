import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Package, RefreshCw } from 'lucide-react';
import {
  hubInventoryApi,
  type HubInventoryTurnoverReport,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

const ITEM_KIND_LABELS: Record<string, string> = {
  product: 'Produto',
  medication: 'Medicamento',
  vaccine: 'Vacina',
};

export const HubRelatoriosStockTurnover: React.FC<Props> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:stock-turnover`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubInventoryTurnoverReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubInventoryApi.reports.turnover(clinicId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar giro de estoque');
    } finally {
      finish();
    }
  }, [clinicId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)} (${data.period_days}d)`
    : '—';

  const avgCover = useMemo(() => {
    const covers = (data?.items ?? [])
      .map((i) => i.days_of_cover)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (covers.length === 0) return null;
    return covers.reduce((a, b) => a + b, 0) / covers.length;
  }, [data]);

  const items = data?.items ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Giro de estoque',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'giro-estoque',
    headers: [
      'Item',
      'Tipo',
      'Saldo',
      'Entradas',
      'Saídas',
      'Estoque médio',
      'Giro',
      'Cobertura (dias)',
    ],
    rows: items.map((row) => [
      row.name,
      ITEM_KIND_LABELS[row.item_kind] ?? row.item_kind,
      row.qty_on_hand,
      row.qty_in,
      row.qty_out,
      row.avg_stock,
      row.turnover_rate,
      row.days_of_cover,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando giro de estoque…" />;
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

      <HubRefreshingBanner show={refreshing} label="Atualizando giro de estoque…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.items_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Package size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Com saída</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.with_outflow ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Itens movimentados no período</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.with_outflow ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <ArrowUpRight size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Giro médio</div>
            <div className="hub-servicos__metric-value">
              {data?.summary.avg_turnover != null
                ? data.summary.avg_turnover.toLocaleString('pt-BR')
                : '—'}
            </div>
            <div className="hub-servicos__metric-sub">Saídas ÷ estoque médio</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <RefreshCw size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Cobertura média</div>
            <div className="hub-servicos__metric-value">
              {avgCover != null ? `${avgCover.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}d` : '—'}
            </div>
            <div className="hub-servicos__metric-sub">Dias estimados de estoque</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${avgCover != null ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Clock size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-turnover-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-turnover-list-title" className="hub-relatorios__section-title">
              Giro por item
            </h2>
            <p className="hub-relatorios__panel-sub">
              Saldo, saídas, estoque médio, giro e cobertura estimada
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Itens</span>
            <span className="hub-relatorios__panel-stat-value">
              {items.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Sem dados de giro"
            description="Não há itens com saldo ou movimentação no período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="hub-finance-page__th-num">Saldo</th>
                  <th className="hub-finance-page__th-num">Saídas</th>
                  <th className="hub-finance-page__th-num">Estoque médio</th>
                  <th className="hub-finance-page__th-num">Giro</th>
                  <th className="hub-finance-page__th-num">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.item_id}>
                    <td>
                      <Link
                        to={stockItemDrillHref(row.item_kind, row.name)}
                        className="hub-finance-page__dash-link"
                      >
                        <span className="hub-relatorios__cell-primary">{row.name}</span>
                      </Link>
                      <div className="hub-relatorios__cell-meta">
                        {ITEM_KIND_LABELS[row.item_kind] ?? row.item_kind}
                        {row.unit_label ? ` · ${row.unit_label}` : ''}
                      </div>
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.qty_on_hand.toLocaleString('pt-BR')}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.qty_out.toLocaleString('pt-BR')}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.avg_stock.toLocaleString('pt-BR')}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.turnover_rate != null
                        ? row.turnover_rate.toLocaleString('pt-BR')
                        : '—'}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.days_of_cover != null
                        ? `${row.days_of_cover.toLocaleString('pt-BR')}d`
                        : '—'}
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

export default HubRelatoriosStockTurnover;
