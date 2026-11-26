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
import { CircleDollarSign, Percent, Receipt } from 'lucide-react';
import { hubFinancialApi, type HubFinanceMyCommissionsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosMyCommissions: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:my-commissions`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceMyCommissionsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getMyCommissionsReport(clinicId, unitId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar suas comissões');
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

  const chartData = useMemo(
    () =>
      (data?.by_service ?? []).slice(0, 8).map((s) => ({
        name: s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
        fullName: s.name,
        comissao: s.commission_total,
        linhas: s.lines_count,
      })),
    [data],
  );

  const avgRatePct = useMemo(() => {
    const sales = data?.summary.total_sales ?? 0;
    const commission = data?.summary.total_commission ?? 0;
    if (sales <= 0) return 0;
    return (commission / sales) * 100;
  }, [data]);

  const items = data?.items ?? [];
  const byService = data?.by_service ?? [];

  const { onCsv: onExport, onPdf } = makeReportExporters({
    clinicId,
    title: 'Minhas comissões',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'minhas-comissoes',
    headers: ['Serviço', 'Descrição', 'Venda', 'Comissão', 'Base', 'Taxa'],
    rows: items.map((i) => [
      i.service_name,
      i.description,
      i.line_total,
      i.commission_amount,
      i.basis,
      i.rate,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando suas comissões…" />;
  }

  return (
    <div className="hub-relatorios__overview">
      <div className="hub-relatorios__overview-toolbar">
        <p className="hub-relatorios__overview-period">
          Período analisado: <strong>{periodLabel}</strong>
          <span className="hub-clientes__muted"> — somente as suas comissões apuradas</span>
        </p>
        <HubRelatoriosExportButton
          onClick={onExport}
          onPdf={onPdf}
          disabled={items.length === 0}
        />
      </div>

      <HubRefreshingBanner show={refreshing} label="Atualizando suas comissões…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Comissão estimada</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_commission ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">Estimativa · {periodLabel}</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Linhas com comissão</div>
            <div className="hub-servicos__metric-value">
              {(data?.summary.lines_with_commission ?? 0).toLocaleString('pt-BR')}
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
            <div className="hub-servicos__metric-label">Vendas suas</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_sales ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">Base das linhas comissionadas</div>
          </div>
          <div className="hub-servicos__metric-icon" aria-hidden>
            <CircleDollarSign size={20} strokeWidth={2} />
          </div>
        </div>
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Taxa média</div>
            <div className="hub-servicos__metric-value">{avgRatePct.toFixed(1)}%</div>
            <div className="hub-servicos__metric-sub">Comissão ÷ vendas do período</div>
          </div>
          <div
            className={`hub-servicos__metric-icon${avgRatePct > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
            aria-hidden
          >
            <Percent size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-comm-chart-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-my-comm-chart-title" className="hub-relatorios__section-title">
              Top serviços
            </h2>
            <p className="hub-relatorios__panel-sub">Suas maiores comissões por serviço</p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma comissão sua"
            description="Quando houver vendas vinculadas aos seus atendimentos com regra de comissão, elas aparecem aqui."
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
                <Bar dataKey="comissao" fill="#f0642f" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-comm-by-service-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-my-comm-by-service-title" className="hub-relatorios__section-title">
              Por serviço
            </h2>
            <p className="hub-relatorios__panel-sub">Resumo das suas vendas e comissão</p>
          </div>
        </div>
        {byService.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma comissão sua"
            description="Quando houver vendas vinculadas aos seus atendimentos com regra de comissão, elas aparecem aqui."
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
                {byService.map((s) => (
                  <tr key={s.service_id}>
                    <td>{s.name}</td>
                    <td className="hub-finance-page__td-num">{s.lines_count.toLocaleString('pt-BR')}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(s.sales_total)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(s.commission_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-my-comm-items-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-my-comm-items-title" className="hub-relatorios__section-title">
              Detalhe
            </h2>
            <p className="hub-relatorios__panel-sub">Linhas comissionadas dos seus atendimentos</p>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Nenhuma linha"
            description="Não há comissões suas neste período."
          />
        ) : (
          <div className="hub-finance-page__table-wrap hub-finance-page__table-wrap--scroll">
            <table className="hub-clientes__table hub-finance-page__panel-table hub-relatorios__table">
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Descrição</th>
                  <th className="hub-finance-page__th-num">Venda</th>
                  <th className="hub-finance-page__th-num">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.line_id}>
                    <td>{i.service_name ?? '—'}</td>
                    <td>{i.description || '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(i.line_total)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(i.commission_amount)}</td>
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
