import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hubInventoryApi, type HubInventoryMovementsReport } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type HubRelatoriosStockMovementsProps = {
  clinicId: string;
  period: HubReportPeriod;
};

export const HubRelatoriosStockMovements: React.FC<HubRelatoriosStockMovementsProps> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubInventoryMovementsReport | null>(null);
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubInventoryApi.reports.movements(clinicId, { ...periodToApiOpts(period), direction });
      setData(res);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar entradas e saídas');
    } finally {
      setLoading(false);
    }
  }, [clinicId, period, direction, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const byTypeRows = useMemo(() => Object.entries(data?.summary.by_type ?? {}), [data]);

  if (loading) return <HubLoading variant="block" label="Carregando movimentações…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('estoque-movimentos'),
      ['Data', 'Item', 'Tipo', 'Direção', 'Qtd', 'Custo', 'Obs'],
      data.items.map((row) => [
        row.created_at,
        row.item_name,
        row.movement_label,
        row.direction,
        row.qty,
        row.unit_cost,
        row.notes,
      ])
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Movimentos</div>
            <div className="hub-servicos__metric-value">{data?.summary.movements_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Qtd. entradas</div>
            <div className="hub-servicos__metric-value hub-finance-page__td-num--pos">
              {data?.summary.qty_in ?? 0}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Qtd. saídas</div>
            <div className="hub-servicos__metric-value hub-finance-page__td-num--neg">
              {data?.summary.qty_out ?? 0}
            </div>
          </div>
        </div>
      </div>

      <div className="hub-clientes__toolbar hub-relatorios__toolbar">
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

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Por tipo de movimento</h2>
        {byTypeRows.length === 0 ? (
          <HubRelatoriosEmpty title="Sem movimentos" description="Não há entradas ou saídas no período." />
        ) : (
          <div className="hub-finance-page__report-list">
            {byTypeRows.map(([type, value]) => (
              <div key={type} className="hub-finance-page__report-row">
                <span>
                  {value.label} · {value.count} mov.
                </span>
                <strong>{value.qty}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Detalhe</h2>
        {(data?.items.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty title="Nenhuma movimentação" description="Ajuste o período ou o filtro de direção." />
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
                {data!.items.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateBr(row.created_at)}</td>
                    <td>
                      <Link
                        to={stockItemDrillHref(row.item_kind, row.item_name)}
                        className="hub-finance-page__dash-link"
                      >
                        {row.item_name}
                      </Link>
                    </td>
                    <td>{row.movement_label}</td>
                    <td
                      className={`hub-finance-page__td-num${
                        row.direction === 'in'
                          ? ' hub-finance-page__td-num--pos'
                          : row.direction === 'out'
                            ? ' hub-finance-page__td-num--neg'
                            : ''
                      }`}
                    >
                      {row.direction === 'out' ? '−' : row.direction === 'in' ? '+' : ''}
                      {row.qty}
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
    </>
  );
};

export default HubRelatoriosStockMovements;
