import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hubFinancialApi, type HubFinanceCommissionsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { downloadCsv, reportCsvFilename } from './hubRelatoriosCsv';
import { receivableDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosCommissions: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HubFinanceCommissionsReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await hubFinancialApi.getCommissionsReport(clinicId, unitId, periodToApiOpts(period)));
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar comissões');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, period, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      (data?.by_service ?? []).slice(0, 10).map((s) => ({
        name: s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
        comissao: s.commission_total,
      })),
    [data]
  );

  const onExport = () => {
    if (!data) return;
    downloadCsv(
      reportCsvFilename('comissoes'),
      ['Serviço', 'Profissional', 'Descrição', 'Venda', 'Comissão', 'Base', 'Taxa'],
      data.items.map((i) => [
        i.service_name,
        i.staff_name,
        i.description,
        i.line_total,
        i.commission_amount,
        i.basis,
        i.rate,
      ])
    );
  };

  if (loading) return <HubLoading variant="block" label="Carregando comissões…" />;

  return (
    <>
      <div className="hub-relatorios__actions">
        <HubRelatoriosExportButton onClick={onExport} disabled={!data?.items.length} />
      </div>

      <div className="hub-servicos__metrics" style={{ marginBottom: 20 }}>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Comissão total</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.summary.total_commission ?? 0)}</div>
            <div className="hub-servicos__metric-sub">
              {data ? `${data.period.from} a ${data.period.to}` : '—'}
            </div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Linhas com comissão</div>
            <div className="hub-servicos__metric-value">{data?.summary.lines_with_commission ?? 0}</div>
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Vendas consideradas</div>
            <div className="hub-servicos__metric-value">{formatBrl(data?.summary.total_sales ?? 0)}</div>
          </div>
        </div>
      </div>

      {chartData.length > 0 ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Top serviços (comissão)</h2>
          <div className="hub-relatorios__chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ede4df" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={56} />
                <Tooltip formatter={(v: number) => formatBrl(v)} />
                <Bar dataKey="comissao" fill="#f0642f" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Por profissional</h2>
        {(data?.by_staff.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty
            title="Sem profissional vinculado"
            description="Comissões de agendamento com staff aparecem aqui quando houver vínculo."
          />
        ) : (
          <div className="hub-finance-page__report-list">
            {data!.by_staff.map((s) => (
              <div key={s.staff_id} className="hub-finance-page__report-row">
                <span>
                  {s.name} · {s.lines_count} linha(s)
                </span>
                <strong>{formatBrl(s.commission_total)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Por serviço</h2>
        {(data?.by_service.length ?? 0) === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma comissão"
            description="Verifique as regras em Financeiro → Comissões e se há vendas no período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th className="hub-finance-page__th-num">Linhas</th>
                  <th className="hub-finance-page__th-num">Vendas</th>
                  <th className="hub-finance-page__th-num">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {data!.by_service.map((s) => (
                  <tr key={s.service_id}>
                    <td>{s.name}</td>
                    <td className="hub-finance-page__td-num">{s.lines_count}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(s.sales_total)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(s.commission_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(data?.items.length ?? 0) > 0 ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Linhas com comissão</h2>
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table hub-relatorios__table--clickable">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th className="hub-finance-page__th-num">Venda</th>
                  <th className="hub-finance-page__th-num">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {data!.items.slice(0, 100).map((row) => (
                  <tr
                    key={row.line_id}
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
                    <td>{row.description || '—'}</td>
                    <td>{row.service_name ?? '—'}</td>
                    <td>{row.staff_name ?? '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.line_total)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.commission_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
};

export default HubRelatoriosCommissions;
