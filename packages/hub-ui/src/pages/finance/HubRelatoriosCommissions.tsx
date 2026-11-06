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
import { CircleDollarSign, Percent, Receipt, Users } from 'lucide-react';
import { hubFinancialApi, type HubFinanceCommissionsReport } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { HubRelatoriosExportButton } from './HubRelatoriosExportButton';
import { HubRelatoriosEmpty } from './HubRelatoriosEmpty';
import { makeReportExporters } from './hubRelatoriosExport';
import { receivableDrillHref } from './hubRelatoriosLinks';
import { periodToApiOpts, type HubReportPeriod } from './hubRelatoriosPeriod';
import { formatBrl, formatDateBr } from './hubRelatoriosUtils';

type Props = { clinicId: string; unitId: string; period: HubReportPeriod };

export const HubRelatoriosCommissions: React.FC<Props> = ({ clinicId, unitId, period }) => {
  const { showError } = useAlert();
  const navigate = useNavigate();
  const resourceKey = `${clinicId}:${unitId}:${period.mode === 'range' ? `${period.from}-${period.to}` : period.days}:commissions`;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(resourceKey);
  const [data, setData] = useState<HubFinanceCommissionsReport | null>(null);

  const load = useCallback(async () => {
    begin();
    try {
      setData(await hubFinancialApi.getCommissionsReport(clinicId, unitId, periodToApiOpts(period)));
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar comissões');
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

  const staffRows = useMemo(() => {
    const list = data?.by_staff ?? [];
    const maxTotal = Math.max(0, ...list.map((s) => s.commission_total));
    return list.map((s) => ({
      ...s,
      widthPct: maxTotal > 0 ? (s.commission_total / maxTotal) * 100 : 0,
    }));
  }, [data]);

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
    title: 'Comissões',
    subtitle: periodLabel !== '—' ? periodLabel : null,
    slug: 'comissoes',
    headers: ['Serviço', 'Profissional', 'Descrição', 'Venda', 'Comissão', 'Base', 'Taxa'],
    rows: items.map((i) => [
      i.service_name,
      i.staff_name,
      i.description,
      i.line_total,
      i.commission_amount,
      i.basis,
      i.rate,
    ]),
    showError,
  });

  if (loading && !data) {
    return <HubLoading variant="block" label="Carregando comissões…" />;
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

      <HubRefreshingBanner show={refreshing} label="Atualizando comissões…" />

      <div className="hub-servicos__metrics hub-relatorios__kpi-row" aria-live="polite">
        <div className="hub-servicos__metric-card">
          <div className="hub-servicos__metric-card__text">
            <div className="hub-servicos__metric-label">Comissão total</div>
            <div className="hub-servicos__metric-value">
              {formatBrl(data?.summary.total_commission ?? 0)}
            </div>
            <div className="hub-servicos__metric-sub">{periodLabel}</div>
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
            <div className="hub-servicos__metric-label">Vendas consideradas</div>
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
            <Users size={20} strokeWidth={2} />
          </div>
        </div>
      </div>

      <div className="hub-relatorios__charts-row">
        <section className="hub-relatorios__panel" aria-labelledby="relatorios-comm-services-chart-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-comm-services-chart-title" className="hub-relatorios__section-title">
                Top serviços
              </h2>
              <p className="hub-relatorios__panel-sub">Maiores comissões por serviço no período</p>
            </div>
          </div>
          {chartData.length === 0 ? (
            <HubRelatoriosEmpty
              title="Nenhuma comissão"
              description="Verifique as regras em Financeiro → Comissões e se há vendas no período."
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

        <section className="hub-relatorios__panel" aria-labelledby="relatorios-comm-staff-title">
          <div className="hub-relatorios__panel-head">
            <div>
              <h2 id="relatorios-comm-staff-title" className="hub-relatorios__section-title">
                Por profissional
              </h2>
              <p className="hub-relatorios__panel-sub">
                Comissões com profissional vinculado ao agendamento
              </p>
            </div>
            <div className="hub-relatorios__panel-stat">
              <span className="hub-relatorios__panel-stat-label">Profissionais</span>
              <span className="hub-relatorios__panel-stat-value">
                {staffRows.length.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
          {staffRows.length === 0 ? (
            <HubRelatoriosEmpty
              title="Sem profissional vinculado"
              description="Comissões de agendamento com staff aparecem aqui quando houver vínculo."
            />
          ) : (
            <ul className="hub-relatorios__aging-list">
              {staffRows.map((row) => (
                <li key={row.staff_id} className="hub-relatorios__aging-row">
                  <div className="hub-relatorios__aging-meta">
                    <span className="hub-relatorios__aging-label">{row.name}</span>
                    <span className="hub-relatorios__aging-count">
                      {row.lines_count.toLocaleString('pt-BR')}{' '}
                      {row.lines_count === 1 ? 'linha' : 'linhas'}
                    </span>
                    <strong className="hub-relatorios__aging-value">
                      {formatBrl(row.commission_total)}
                    </strong>
                  </div>
                  <div className="hub-relatorios__aging-track" aria-hidden>
                    <span
                      className="hub-relatorios__aging-fill hub-relatorios__aging-fill--risk"
                      style={{
                        width: `${Math.max(row.widthPct, row.commission_total > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-comm-by-service-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-comm-by-service-title" className="hub-relatorios__section-title">
              Por serviço
            </h2>
            <p className="hub-relatorios__panel-sub">Resumo de vendas e comissão por tipo de serviço</p>
          </div>
        </div>
        {byService.length === 0 ? (
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
                {byService.map((s) => (
                  <tr key={s.service_id}>
                    <td>
                      <div className="hub-relatorios__cell-primary">{s.name}</div>
                    </td>
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

      <section className="hub-relatorios__panel" aria-labelledby="relatorios-comm-lines-title">
        <div className="hub-relatorios__panel-head">
          <div>
            <h2 id="relatorios-comm-lines-title" className="hub-relatorios__section-title">
              Linhas com comissão
            </h2>
            <p className="hub-relatorios__panel-sub">
              Até 100 linhas. Clique para abrir o recebível.
            </p>
          </div>
          <div className="hub-relatorios__panel-stat">
            <span className="hub-relatorios__panel-stat-label">Exibindo</span>
            <span className="hub-relatorios__panel-stat-value">
              {Math.min(items.length, 100).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
        {items.length === 0 ? (
          <HubRelatoriosEmpty
            title="Sem linhas"
            description="Não há linhas comissionadas neste período."
          />
        ) : (
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
                {items.slice(0, 100).map((row) => (
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
                    <td>
                      <div className="hub-relatorios__cell-primary">{row.description || '—'}</div>
                      {row.rate != null ? (
                        <div className="hub-relatorios__cell-meta">
                          Taxa {row.rate}
                          {row.basis ? ` · ${row.basis}` : ''}
                        </div>
                      ) : null}
                    </td>
                    <td>{row.service_name ?? '—'}</td>
                    <td>{row.staff_name ?? '—'}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.line_total)}</td>
                    <td className="hub-finance-page__td-num">{formatBrl(row.commission_amount)}</td>
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

export default HubRelatoriosCommissions;
