import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CircleDollarSign, Layers, LayoutGrid, Receipt } from 'lucide-react';
import {
  hubFinancialApi,
  type HubFinanceMovementBySectorReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { serviceGroupLabel } from '../../utils/serviceTypeSlug';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

function sectorLabel(group: string): string {
  if (group === 'produtos') return 'Produtos';
  if (group === 'nao_alocado_financeiro') return 'Não alocado (financeiro)';
  return serviceGroupLabel(group);
}

export const HubRelatoriosMovementBySector: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:movement-by-sector`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceMovementBySectorReport | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('all');

  const load = useCallback(async () => {
    begin();
    try {
      setData(
        await hubFinancialApi.getMovementBySectorReport(clinicId, unitId, periodToApiOpts(period)),
      );
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar movimentação por setor');
    } finally {
      finish();
    }
  }, [clinicId, unitId, period, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setGroupFilter('all');
  }, [resourceKey]);

  const periodLabel = data
    ? `${formatDateBr(data.period.from)} a ${formatDateBr(data.period.to)}`
    : '—';

  const groupRows = data?.by_group ?? [];
  const maxGroupTotal = Math.max(0, ...groupRows.map((g) => g.total));

  const filteredServices = useMemo(() => {
    const rows = data?.by_service ?? [];
    if (groupFilter === 'all') return rows;
    return rows.filter((row) => row.service_group === groupFilter);
  }, [data, groupFilter]);

  const filteredTotal = useMemo(
    () => filteredServices.reduce((acc, row) => acc + row.total, 0),
    [filteredServices],
  );

  const chartData = useMemo(
    () =>
      groupRows.slice(0, 10).map((g) => ({
        key: g.service_group,
        name: sectorLabel(g.service_group).slice(0, 14),
        fullName: sectorLabel(g.service_group),
        total: g.total,
        linhas: g.lines_count,
      })),
    [groupRows],
  );

  const filterOptions = useMemo(() => {
    const opts = [{ id: 'all', label: 'Todos os setores' }];
    for (const g of groupRows) {
      opts.push({ id: g.service_group, label: sectorLabel(g.service_group) });
    }
    return opts;
  }, [groupRows]);

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Movimentação por setor',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'movimentacao-por-setor',
    headers: ['Setor', 'Serviço / item', 'Linhas', 'Quantidade', 'Total'],
    rows: filteredServices.map((row) => [
      sectorLabel(row.service_group),
      row.name,
      row.lines_count,
      row.quantity,
      row.total,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando movimentação por setor…" />;
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
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={filteredServices.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando movimentação por setor…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Receita líquida</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.summary.total ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              Devoluções {formatBrl(data?.summary.returns_commercial ?? 0)}
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Linhas</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.lines_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">
              {(data?.summary.receivables_count ?? 0).toLocaleString('pt-BR')} recebíveis
            </div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Receipt size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Setores</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.groups_count ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="hub-servicos__metric-sub">Grupos com movimento no período</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${(data?.summary.groups_count ?? 0) > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <LayoutGrid size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Filtro atual</div>
            <div className="hub-servicos__metric-value">{formatBrl(filteredTotal)}</div>
            <div className="hub-servicos__metric-sub">
              {groupFilter === 'all' ? 'Todos os setores' : sectorLabel(groupFilter)}
            </div>
          </div>
          <div
            className={`hub-servicos__metric-icon${filteredTotal > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Layers size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="hub-relatorios__charts-row">
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-sector-chart-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-sector-chart-title" className="hub-relatorios__section-title">
                Por setor
              </h2>
              <p className="hub-relatorios__panel-sub">Participação das vendas por grupo de serviço</p>
            </div>
          </div>
          {chartData.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem movimentação"
              description="Não há linhas de venda no período para esta unidade."
            />
          ) : (
            <div className="hub-relatorios__chart hub-relatorios__chart--tall">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#8a6f64' }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11, fill: '#6b554f' }}
                  />
                  <Tooltip
                    formatter={(v: number, _name, item) => [
                      formatBrl(v),
                      `${(item?.payload as { linhas?: number } | undefined)?.linhas ?? 0} linha(s)`,
                    ]}
                    labelFormatter={(_label, payload) =>
                      (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ??
                      String(_label)
                    }
                  />
                  <Bar dataKey="total" fill="#f0642f" radius={[0, 6, 6, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="hub-relatorios__panel" aria-labelledby="relatorios-sector-share-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-sector-share-title" className="hub-relatorios__section-title">
                Participação
              </h2>
              <p className="hub-relatorios__panel-sub">Totais e % de cada setor no período</p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Total</span>
              <span className="hub-relatorios__panel-stat-value">
                {formatBrl(data?.summary.total ?? 0)}
              </span>
            </div>
          </div>
          {groupRows.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem setores"
              description="Quando houver vendas, o rateio por grupo aparece aqui."
            />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {groupRows.map((row) => (
                <li key={row.service_group} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{sectorLabel(row.service_group)}</span>
                    <span className="hub-relatorios__aging-count">
                      {row.lines_count.toLocaleString('pt-BR')}{' '}
                      {row.lines_count === 1 ? 'linha' : 'linhas'} · {row.share_pct.toFixed(1)}%
                    </span>
                    <strong className="hub-relatorios__aging-value">{formatBrl(row.total)}</strong>
                  </div>
                  <div className="hub-relatorios__aging-track" aria-hidden>
                    <span
                      className="hub-relatorios__aging-fill hub-relatorios__aging-fill--ok"
                      style={{
                        width: `${Math.max(
                          maxGroupTotal > 0 ? (row.total / maxGroupTotal) * 100 : 0,
                          row.total > 0 ? 4 : 0,
                        )}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-sector-detail-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-sector-detail-title" className="hub-relatorios__section-title">
              Detalhe por serviço
            </h2>
            <p className="hub-relatorios__panel-sub">
              Filtre por setor para ver o que saiu de cada categoria
            </p>
          </div>
        </div>

        <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por setor">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`hub-dayboard__toggle-btn${groupFilter === opt.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setGroupFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {filteredServices.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhum item neste filtro"
            description="Escolha outro setor ou amplie o período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Serviço / item</th>
                  <th className="hub-finance-page__th-num">Linhas</th>
                  <th className="hub-finance-page__th-num">Qtd.</th>
                  <th className="hub-finance-page__th-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((row) => (
                  <tr key={`${row.service_group}:${row.service_id ?? row.name}`}>
                    <td>
                      <div className="hub-relatorios__cell-primary">
                        {sectorLabel(row.service_group)}
                      </div>
                    </td>
                    <td>{row.name}</td>
                    <td className="hub-finance-page__td-num">{row.lines_count}</td>
                    <td className="hub-finance-page__td-num">
                      {row.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.total)}</td>
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

export default HubRelatoriosMovementBySector;
