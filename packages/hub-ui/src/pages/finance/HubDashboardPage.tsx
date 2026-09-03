import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Package,
  Receipt,
  Syringe,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  hubFinancialApi,
  type HubCashSession,
  type HubFinanceAgingReport,
  type HubFinanceDashboardSummary,
  type HubFinanceRevenueSeriesPoint,
  type HubFinanceTicketAverageReport,
} from '../../api/hubFinancialApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import { useAlert } from '../../components/AlertProvider';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function ymdTodayUtc(): string {
  const dt = new Date();
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

type PeriodPreset = 'today' | '7' | '30' | '90';

function periodOpts(preset: PeriodPreset): { days?: number; from?: string; to?: string } {
  const to = ymdTodayUtc();
  if (preset === 'today') return { from: to, to };
  const n = preset === '7' ? 7 : preset === '30' ? 30 : 90;
  return { days: n };
}

function reportHref(relatorio: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ relatorio, ...extra });
  return `/hub/relatorios?${q}`;
}

type RevenueBucket = 'day' | 'week' | 'month';

const HubDashboardPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const [preset, setPreset] = useState<PeriodPreset>('30');
  const [revenueBucket, setRevenueBucket] = useState<RevenueBucket>('day');
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [revenuePoints, setRevenuePoints] = useState<HubFinanceRevenueSeriesPoint[]>([]);
  const [ticket, setTicket] = useState<HubFinanceTicketAverageReport | null>(null);
  const [aging, setAging] = useState<HubFinanceAgingReport | null>(null);
  const [clinicalAlerts, setClinicalAlerts] = useState<{ type: string; message: string }[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openCashSession, setOpenCashSession] = useState<HubCashSession | null>(null);

  const periodQuery = useMemo(() => periodOpts(preset), [preset]);
  const hasClinicRead = hasPermission('hub.clinic.read');
  const hasInvRead = hasPermission('hub.inventory.read');
  const hasReports =
    hasPermission('hub.reports.read') ||
    hasPermission('hub.financial.read') ||
    hasPermission('hub.inventory.read') ||
    hasPermission('hub.guardians.read');

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, rev, tic, ag, clin, low, cashRes] = await Promise.all([
        hubFinancialApi.getDashboardSummary(clinicId, unitId, periodQuery),
        hubFinancialApi.getRevenueSeries(clinicId, unitId, { ...periodQuery, bucket: revenueBucket }),
        hubFinancialApi.getTicketAverageReport(clinicId, unitId, periodQuery),
        hubFinancialApi.getAgingReport(clinicId, unitId),
        hasClinicRead ? hubClinicalApi.alerts(clinicId) : Promise.resolve({ alerts: [] }),
        hasInvRead ? hubInventoryApi.reports.lowStock(clinicId) : Promise.resolve({ items: [] }),
        hubFinancialApi.getCashSessionOpen(clinicId, unitId).catch(() => ({ cash_session: null })),
      ]);

      setSummary(s);
      setOpenCashSession(cashRes.cash_session ?? null);
      setRevenuePoints(rev.points ?? []);
      setTicket(tic);
      setAging(ag);
      setClinicalAlerts((clin.alerts ?? []).map((a) => ({ type: a.type, message: a.message })));
      setLowStockCount((low.items ?? []).length);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar dashboard');
      setSummary(null);
      setRevenuePoints([]);
      setTicket(null);
      setAging(null);
      setClinicalAlerts([]);
      setLowStockCount(0);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, periodQuery, revenueBucket, hasClinicRead, hasInvRead, showError]);

  useEffect(() => {
    if (permLoading || !hasPermission('hub.financial.read')) return;
    if (!clinicId || !unitId) return;
    void load();
  }, [permLoading, hasPermission, clinicId, unitId, load]);

  const overdueAging = useMemo(() => {
    if (!aging?.buckets) return { count: 0, total: 0 };
    const b = aging.buckets;
    const keys = ['overdue_1_30', 'overdue_31_60', 'overdue_61_plus'] as const;
    let count = 0;
    let total = 0;
    for (const k of keys) {
      count += b[k]?.count ?? 0;
      total += b[k]?.total ?? 0;
    }
    return { count, total };
  }, [aging]);

  const outstanding = summary?.receivables_outstanding ?? 0;
  const periodDaysParam: Record<string, string> =
    preset === 'today'
      ? { from: ymdTodayUtc(), to: ymdTodayUtc() }
      : { days: String(preset === '7' ? 7 : preset === '30' ? 30 : 90) };

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-finance-page--dashboard">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return shell(
      <p className="hub-clientes__muted">
        O dashboard financeiro requer a permissão de leitura financeira. Use as áreas de operação ou peça acesso à
        gestão.
      </p>,
    );
  }

  if (!clinicId || !unitId) {
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para ver o dashboard.</p>);
  }

  return shell(
    <>
      <div className="hub-dash__toolbar hub-clientes__toolbar hub-dash__toolbar--wrap">
        <div className="hub-servicos__filter-field">
          <span className="hub-clientes__label">Período</span>
          <select
            className="hub-clientes__select-input"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            aria-label="Período do dashboard"
          >
            <option value="today">Hoje</option>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
          </select>
        </div>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary hub-dash__toolbar-btn"
          onClick={() => void load()}
          disabled={loading}
        >
          Atualizar
        </button>
        {hasReports ? (
          <Link className="hub-clientes__btn hub-clientes__btn--ghost hub-dash__toolbar-btn" to="/hub/relatorios">
            <BarChart3 size={16} aria-hidden />
            Relatórios
          </Link>
        ) : null}
      </div>

      <div className="hub-dash__kpi-row" aria-live="polite">
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Receita recebida</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : formatBrl(summary?.payments_total_period ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Pagamentos no período</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Vendas</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : String(ticket?.receivables_count ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Recebíveis criados</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Ticket médio</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : formatBrl(ticket?.ticket_average ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Média por recebível</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Em aberto</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : formatBrl(outstanding)}</div>
          <div className="hub-dash__kpi-hint">Saldo de recebíveis</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Pets atendidos</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : String(summary?.pets_attended_distinct ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Pets distintos na agenda</div>
        </div>
      </div>

      <section className="hub-dash__panel hub-dash__panel--hero" aria-labelledby="dash-revenue-series-title">
        <div className="hub-dash__panel-head">
          <div>
            <h2 id="dash-revenue-series-title" className="hub-dash__panel-title">
              Tendência de receita
            </h2>
            <p className="hub-dash__panel-sub">Pagamentos consolidados no período.</p>
          </div>
          <div className="hub-dash__segmented" role="group" aria-label="Granularidade do gráfico">
            {(['day', 'week', 'month'] as const).map((b) => (
              <button
                key={b}
                type="button"
                className={`hub-dash__segmented-btn${revenueBucket === b ? ' hub-dash__segmented-btn--active' : ''}`}
                onClick={() => setRevenueBucket(b)}
                disabled={loading}
              >
                {b === 'day' ? 'Dia' : b === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        </div>
        <div className="hub-dash__chart-wrap" style={{ height: 260 }}>
          {loading ? (
            <div className="hub-dash__chart-skeleton" />
          ) : revenuePoints.length === 0 ? (
            <p className="hub-clientes__muted">Sem pagamentos no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenuePoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ded8" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7a655e' }} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                  tick={{ fontSize: 11, fill: '#7a655e' }}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [formatBrl(Number(v)), 'Receita']}
                  labelFormatter={(label) => String(label ?? '')}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5dcd6' }}
                />
                <Line type="monotone" dataKey="amount" stroke="#f0642f" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="hub-dash__panel-footer">
          <Link className="hub-finance-page__dash-link" to={reportHref('finance-overview', periodDaysParam)}>
            Ver visão financeira completa
          </Link>
          <Link className="hub-finance-page__dash-link" to={reportHref('cash-flow', periodDaysParam)}>
            Fluxo de caixa
          </Link>
        </div>
      </section>

      <div className="hub-dash__two-col" style={{ marginTop: 18 }}>
        <section className="hub-dash__panel" aria-labelledby="dash-alerts-title">
          <h2 id="dash-alerts-title" className="hub-dash__panel-title">
            Precisa de atenção
          </h2>
          <div className="hub-dash__alerts">
            {openCashSession?.status === 'open' ? (
              <div className="hub-dash__alert-card">
                <Wallet size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="hub-dash__alert-title">Caixa aberto</div>
                  <div className="hub-dash__alert-meta">
                    {openCashSession.opened_at
                      ? `Desde ${new Date(openCashSession.opened_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Sessão em aberto'}
                  </div>
                </div>
                <Link className="hub-dash__alert-cta" to="/hub/caixa">
                  Ver Caixa <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}

            <div className="hub-dash__alert-card">
              <AlertCircle size={20} strokeWidth={1.75} aria-hidden />
              <div>
                <div className="hub-dash__alert-title">Cobrança não gerada</div>
                <div className="hub-dash__alert-meta">
                  {loading ? '—' : `${summary?.pending_billing_count ?? 0} itens sem cobrança`}
                </div>
              </div>
              <Link className="hub-dash__alert-cta" to={reportHref('unbilled', { days: '30' })}>
                Ver relatório <ArrowRight size={14} />
              </Link>
            </div>

            <div className="hub-dash__alert-card">
              <Receipt size={20} strokeWidth={1.75} aria-hidden />
              <div>
                <div className="hub-dash__alert-title">Recebíveis vencidos</div>
                <div className="hub-dash__alert-meta">
                  {loading ? '—' : `${overdueAging.count} títulos · ${formatBrl(overdueAging.total)}`}
                </div>
              </div>
              <Link className="hub-dash__alert-cta" to={reportHref('pending-payments')}>
                Pagamentos pendentes <ArrowRight size={14} />
              </Link>
            </div>

            {hasClinicRead && clinicalAlerts.length > 0 ? (
              <div className="hub-dash__alert-card">
                <Syringe size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="hub-dash__alert-title">Vacinas / clínica</div>
                  <div className="hub-dash__alert-meta">{clinicalAlerts.length} alerta(s) nos próximos 30 dias</div>
                </div>
                <Link className="hub-dash__alert-cta" to={reportHref('vaccines-due', { days: '30' })}>
                  Vacinas a vencer <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}

            {hasInvRead && lowStockCount > 0 ? (
              <div className="hub-dash__alert-card">
                <Package size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="hub-dash__alert-title">Estoque baixo</div>
                  <div className="hub-dash__alert-meta">{lowStockCount} item(ns) abaixo do mínimo</div>
                </div>
                <Link className="hub-dash__alert-cta" to="/hub/estoque/alertas">
                  Ver alertas <ArrowRight size={14} />
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <section className="hub-dash__panel" aria-labelledby="dash-shortcuts-title">
          <h2 id="dash-shortcuts-title" className="hub-dash__panel-title">
            Ir para análise
          </h2>
          <p className="hub-dash__panel-sub">Relatórios para aprofundar. A Dashboard só aponta o que importa agora.</p>
          <div className="hub-dash__shortcuts">
            <Link className="hub-dash__shortcut" to={reportHref('finance-overview', periodDaysParam)}>
              Visão financeira
              <ArrowRight size={14} aria-hidden />
            </Link>
            <Link className="hub-dash__shortcut" to={reportHref('cash-flow', periodDaysParam)}>
              Fluxo de caixa
              <ArrowRight size={14} aria-hidden />
            </Link>
            <Link className="hub-dash__shortcut" to={reportHref('top-clients', periodDaysParam)}>
              Top clientes
              <ArrowRight size={14} aria-hidden />
            </Link>
            <Link className="hub-dash__shortcut" to={reportHref('pending-payments')}>
              Pagamentos pendentes
              <ArrowRight size={14} aria-hidden />
            </Link>
            {hasInvRead ? (
              <Link className="hub-dash__shortcut" to={reportHref('stock-abc', periodDaysParam)}>
                Curva ABC de estoque
                <ArrowRight size={14} aria-hidden />
              </Link>
            ) : null}
            <Link className="hub-dash__shortcut" to="/hub/relatorios">
              Catálogo completo
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <div className="hub-dash__ops-meta">
            Despesas no período:{' '}
            <strong>{loading ? '—' : formatBrl(summary?.expenses_total_period ?? 0)}</strong>
            {' · '}
            Saldo operacional:{' '}
            <strong>{loading ? '—' : formatBrl(summary?.net_operational_period ?? 0)}</strong>
          </div>
        </section>
      </div>
    </>,
  );
};

export default HubDashboardPage;
