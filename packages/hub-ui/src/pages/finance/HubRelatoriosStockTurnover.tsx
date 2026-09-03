import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubInventoryApi,
  type HubInventoryTurnoverReport,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';

type Props = { clinicId: string; period: HubReportPeriod };

export const HubRelatoriosStockTurnover: React.FC<Props> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubInventoryTurnoverReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubInventoryApi.reports.turnover(clinicId, periodToApiOpts(period)));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar giro de estoque');
    } finally {
      setLoading(false);
    }
  }, [clinicId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando giro de estoque…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('giro-estoque'),
      [
        'Item',
        'Tipo',
        'Saldo',
        'Entradas',
        'Saídas',
        'Estoque médio',
        'Giro',
        'Cobertura (dias)',
      ],
      data.items.map((row) => [
        row.name,
        row.item_kind,
        row.qty_on_hand,
        row.qty_in,
        row.qty_out,
        row.avg_stock,
        row.turnover_rate,
        row.days_of_cover,
      ]),
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
            <div className="hub-servicos__metric-label">Itens</div>
            <div className="hub-servicos__metric-value">{data?.summary.items_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to} (${data.period_days}d)` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Com saída</div>
            <div className="hub-servicos__metric-value">{data?.summary.with_outflow ?? 0}</div>
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
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
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
              {data!.items.map((row) => (
                <tr key={row.item_id}>
                  <td>
                    <Link
                      to={stockItemDrillHref(row.item_kind, row.name)}
                      className="hub-finance-page__dash-link"
                    >
                      {row.name}
                    </Link>
                    {row.unit_label ? (
                      <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                        {row.unit_label}
                      </div>
                    ) : null}
                  </td>
                  <td className="hub-finance-page__td-num">{row.qty_on_hand.toLocaleString('pt-BR')}</td>
                  <td className="hub-finance-page__td-num">{row.qty_out.toLocaleString('pt-BR')}</td>
                  <td className="hub-finance-page__td-num">{row.avg_stock.toLocaleString('pt-BR')}</td>
                  <td className="hub-finance-page__td-num">
                    {row.turnover_rate != null ? row.turnover_rate.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="hub-finance-page__td-num">
                    {row.days_of_cover != null ? `${row.days_of_cover.toLocaleString('pt-BR')}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default HubRelatoriosStockTurnover;
