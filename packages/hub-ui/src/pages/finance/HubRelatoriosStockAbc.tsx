import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hubInventoryApi,
  type HubInventoryAbcReport,
} from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { stockItemDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl } from './hubRelatoriosUtils';

type Props = { clinicId: string; period: HubReportPeriod };

export const HubRelatoriosStockAbc: React.FC<Props> = ({ clinicId, period }) => {
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubInventoryAbcReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubInventoryApi.reports.abc(clinicId, periodToApiOpts(period)));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar curva ABC');
    } finally {
      setLoading(false);
    }
  }, [clinicId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando curva ABC…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('curva-abc-estoque'),
      ['#', 'Classe', 'Item', 'Tipo', 'Qtd saída', 'Valor consumo', 'Participação %', 'Acumulado %'],
      data.items.map((row) => [
        row.rank,
        row.abc_class,
        row.name,
        row.item_kind,
        row.qty_out,
        row.consumption_value,
        row.share_pct,
        row.cumulative_pct,
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
            <div className="hub-servicos__metric-label">Itens com saída</div>
            <div className="hub-servicos__metric-value">{data?.summary.items_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor consumido</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_consumption_value ?? 0)}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">A / B / C</div>
            <div className="hub-servicos__metric-value">
              {data
                ? `${data.summary.class_a} / ${data.summary.class_b} / ${data.summary.class_c}`
                : '—'}
            </div>
            <div className="hub-servicos__metric-sub">80% / 15% / 5% do valor</div>
          </div>
        </div>
      </div>

      {(data?.items.length ?? 0) === 0 ? (
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
              {data!.items.map((row) => (
                <tr key={row.item_id}>
                  <td>{row.rank}</td>
                  <td>
                    <span className={`hub-clientes__pill${row.abc_class === 'A' ? ' hub-finance-page__pill--warning' : ''}`}>
                      {row.abc_class}
                    </span>
                  </td>
                  <td>
                    <Link
                      to={stockItemDrillHref(row.item_kind, row.name)}
                      className="hub-finance-page__dash-link"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="hub-finance-page__td-num">{row.qty_out.toLocaleString('pt-BR')}</td>
                  <td className="hub-finance-page__td-num">{formatBrl(row.consumption_value)}</td>
                  <td className="hub-finance-page__td-num">{row.share_pct.toLocaleString('pt-BR')}%</td>
                  <td className="hub-finance-page__td-num">
                    {row.cumulative_pct.toLocaleString('pt-BR')}%
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

export default HubRelatoriosStockAbc;
