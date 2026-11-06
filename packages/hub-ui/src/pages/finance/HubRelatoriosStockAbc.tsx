import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, Layers, Package, PieChart } from 'lucide-react';
import {
  hubInventoryApi,
  type HubInventoryAbcReport,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

const ITEM_KIND_LABELS: Record<string, string> = {
  product: 'Produto',
  medication: 'Medicamento',
  vaccine: 'Vacina',
};

const CLASS_TONE: Record<string, string> = {
  A: 'critical',
  B: 'warn',
  C: 'ok',
};

export const HubRelatoriosStockAbc: React.FC<Props> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:stock-abc`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubInventoryAbcReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubInventoryApi.reports.abc(clinicId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar curva ABC');
    } finally {
      finish();
    }
  }, [clinicId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const classBars = useMemo(() => {
    if (!data) return [];
    const rows = [
      { key: 'A', label: 'Classe A (~80% do valor)', count: data.summary.class_a, tone: 'critical' },
      { key: 'B', label: 'Classe B (~15% do valor)', count: data.summary.class_b, tone: 'warn' },
      { key: 'C', label: 'Classe C (~5% do valor)', count: data.summary.class_c, tone: 'ok' },
    ].filter((r) => r.count > 0);
    const max = Math.max(0, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      widthPct: max > 0 ? (r.count / max) * 100 : 0,
    }));
  }, [data]);

  const items = data?.items ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Curva ABC',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'curva-abc-estoque',
    headers: ['#', 'Classe', 'Item', 'Tipo', 'Qtd saída', 'Valor consumo', 'Participação %', 'Acumulado %'],
    rows: items.map((row) => [
      row.rank,
      row.abc_class,
      row.name,
      ITEM_KIND_LABELS[row.item_kind] ?? row.item_kind,
      row.qty_out,
      row.consumption_value,
      row.share_pct,
      row.cumulative_pct,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando curva ABC…" />;
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

      <HubRefreshingBanner show={refreshing} label="Atualizando curva ABC…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Itens com saída</div>
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
            <div className="hub-servicos__metric-label">Valor consumido</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_consumption_value ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">Base da classificação Pareto</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Classe A</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.class_a ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">~80% do valor consumido</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.class_a ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <PieChart size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">B / C</div>
            <div className="hub-servicos__metric-value">
              {data
                ? `${data.summary.class_b.toLocaleString('pt-BR')} / ${data.summary.class_c.toLocaleString('pt-BR')}`
                : '—'}
            </div>
            <div className="hub-servicos__metric-sub">15% / 5% do valor</div>
          </div>
          <div className="hub-servicos__metric-icon hub-servicos__metric-icon--muted" aria-hidden>
            <Layers size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      {classBars.length > 0 ? (
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-abc-classes-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-abc-classes-title" className="hub-relatorios__section-title">
                Distribuição por classe
              </h2>
              <p className="hub-relatorios__panel-sub">Quantidade de itens em cada faixa Pareto</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Valor total</span>
              <span className="hub-relatorios__panel-stat-value">
                {formatBrl(data?.summary.total_consumption_value ?? 0)}
              </span>
            </div>
          </div>
          <ul className="hub-relatorios__aging-list">
            {classBars.map((row) => (
              <li key={row.key} className="hub-relatorios__aging-row">
                <div className="hub-relatorios__aging-meta">
                  <span className="hub-relatorios__aging-label">{row.label}</span>
                  <span className="hub-relatorios__aging-count">
                    {row.count.toLocaleString('pt-BR')} {row.count === 1 ? 'item' : 'itens'}
                  </span>
                  <strong className="hub-relatorios__aging-value">{row.key}</strong>
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-abc-list-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-abc-list-title" className="hub-relatorios__section-title">
              Ranking de consumo
            </h2>
            <p className="hub-relatorios__panel-sub">
              Itens ordenados por valor de saída no período
            </p>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Sem consumo no período"
            description="Não há saídas de estoque com valor para classificar na curva ABC."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Classe</th>
                  <th>Item</th>
                  <th className="hub-finance-page__th-num">Qtd saída</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                  <th className="hub-finance-page__th-num">%</th>
                  <th className="hub-finance-page__th-num">Acum.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.item_id}>
                    <td>{row.rank}</td>
                    <td>
                      <span
                        className={`hub-clientes__pill${
                          row.abc_class === 'A' ? ' hub-finance-page__pill--warning' : ''
                        }`}
                        title={CLASS_TONE[row.abc_class] ? `Classe ${row.abc_class}` : undefined}
                      >
                        {row.abc_class}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={stockItemDrillHref(row.item_kind, row.name)}
                        className="hub-finance-page__dash-link"
                      >
                        <span className="hub-relatorios__cell-primary">{row.name}</span>
                      </Link>
                      <div className="hub-relatorios__cell-meta">
                        {ITEM_KIND_LABELS[row.item_kind] ?? row.item_kind}
                      </div>
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.qty_out.toLocaleString('pt-BR')}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {formatBrl(row.consumption_value)}
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.share_pct.toLocaleString('pt-BR')}%
                    </td>
                    <td className="hub-finance-page__td-num">
                      {row.cumulative_pct.toLocaleString('pt-BR')}%
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

export default HubRelatoriosStockAbc;
