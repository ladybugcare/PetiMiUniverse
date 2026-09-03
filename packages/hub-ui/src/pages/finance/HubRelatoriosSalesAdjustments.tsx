import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  hubFinancialApi,
  type HubFinanceSalesAdjustmentsReport,
} from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { receivableDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

const ADJUSTMENT_LABELS: Record<string, string> = {
  discount: 'Desconto',
  credit: 'Crédito',
  write_off: 'Baixa',
  refund: 'Estorno',
  manual_adjustment: 'Ajuste manual',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

type HubRelatoriosSalesAdjustmentsProps = {
  clinicId: string;
  unitId: string;
  period: HubReportPeriod;
};

export const HubRelatoriosSalesAdjustments: React.FC<HubRelatoriosSalesAdjustmentsProps> = ({
  clinicId,
  unitId,
  period,
}) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubFinanceSalesAdjustmentsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hubFinancialApi.getSalesAdjustmentsReport(clinicId, unitId, periodToApiOpts(period));
      setData(res);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar vendas e acertos');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <HubLoading variant="block" label="Carregando vendas e acertos…" />;

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('vendas-acertos'),
      ['Data', 'Cliente', 'Tipo', 'Motivo', 'Valor'],
      data.adjustments.items.map((row) => [
        row.created_at,
        row.guardian_name,
        ADJUSTMENT_LABELS[row.adjustment_type] ?? row.adjustment_type,
        row.reason,
        row.amount,
      ])
    );
  };

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.adjustments.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vendas (recebíveis)</div>
            <div className="hub-servicos__metric-value">{data?.sales.receivables_count ?? 0}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Valor das vendas</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.sales.total ?? 0)}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Acertos</div>
            <div className="hub-servicos__metric-value">{data?.adjustments.count ?? 0}</div>
            <div className="hub-servicos__metric-sub">{formatBrl(data?.adjustments.total ?? 0)}</div>
          </div>
        </div>
      </div>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Vendas por status</h2>
        {Object.entries(data?.sales.by_status ?? {}).length === 0 ? (
          <HubRelatoriosEmpty title="Sem vendas" description="Não há recebíveis criados no período." />
        ) : (
          <div className="hub-finance-page__report-list">
            {Object.entries(data?.sales.by_status ?? {}).map(([status, value]) => (
              <div key={status} className="hub-finance-page__report-row">
                <span>
                  {STATUS_LABELS[status] ?? status} · {value.count}
                </span>
                <strong>{formatBrl(value.total)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Acertos por tipo</h2>
        {Object.entries(data?.adjustments.by_type ?? {}).length === 0 ? (
          <HubRelatoriosEmpty title="Sem acertos" description="Não há descontos, estornos ou baixas no período." />
        ) : (
          <div className="hub-finance-page__report-list">
            {Object.entries(data?.adjustments.by_type ?? {}).map(([type, value]) => (
              <div key={type} className="hub-finance-page__report-row">
                <span>
                  {ADJUSTMENT_LABELS[type] ?? type} · {value.count}
                </span>
                <strong>{formatBrl(value.total)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Detalhe dos acertos</h2>
        {(data?.adjustments.items.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty title="Nenhum acerto listado" description="Ajuste o período ou registre acertos no financeiro." />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Motivo</th>
                  <th className="hub-finance-page__th-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data!.adjustments.items.map((row) => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    className="hub-relatorios__row-link"
                    onClick={() => navigate(receivableDrillHref(row.receivable_id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(receivableDrillHref(row.receivable_id));
                      }
                    }}
                  >
                    <td>{formatDateBr(row.created_at)}</td>
                    <td>{row.guardian_name ?? '—'}</td>
                    <td>{ADJUSTMENT_LABELS[row.adjustment_type] ?? row.adjustment_type}</td>
                    <td>{row.reason?.trim() || '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.amount)}</td>
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

export default HubRelatoriosSalesAdjustments;
