import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { AlertCircle, ArrowRight, Receipt, Syringe, Package } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  hubFinancialApi,
  type HubFinanceAgingReport,
  type HubFinanceDashboardSummary,
  type HubFinanceRevenueSeriesPoint,
  type HubFinanceTicketAverageReport,
  type HubFinanceTopServicesReport,
} from '../../api/hubFinancialApi';
import { hubAppointmentsApi, type HubAppointmentsServiceGroupStat } from '../../api/hubAppointmentsApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubInventoryApi } from '../../api/hubInventoryApi';
import { hubStaffApi, type HubStaffMember } from '../../api/hubStaffApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
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

function addDaysUtcYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

type PeriodPreset = 'today' | '7' | '30' | '90' | '365';

function periodOpts(preset: PeriodPreset): { days?: number; from?: string; to?: string } {
  const to = ymdTodayUtc();
  if (preset === 'today') return { from: to, to };
  const n = preset === '7' ? 7 : preset === '30' ? 30 : preset === '90' ? 90 : 365;
  return { days: n };
}

/** Limites YYYY-MM-DD alinhados ao backend (`parsePeriodQuery` + `ymdTodayUtc`). */
function periodFromTo(preset: PeriodPreset): { from: string; to: string } {
  const to = ymdTodayUtc();
  if (preset === 'today') return { from: to, to };
  const n = preset === '7' ? 7 : preset === '30' ? 30 : preset === '90' ? 90 : 365;
  return { from: addDaysUtcYmd(to, -(n - 1)), to };
}

const DONUT_COLORS = ['#f0642f', '#6366f1', '#14b8a6', '#eab308', '#a855f7', '#64748b', '#ec4899'];

type RevenueBucket = 'day' | 'week' | 'month';

const HubDashboardPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const [preset, setPreset] = useState<PeriodPreset>('30');
  const [revenueBucket, setRevenueBucket] = useState<RevenueBucket>('day');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('');
  const [summary, setSummary] = useState<HubFinanceDashboardSummary | null>(null);
  const [revenuePoints, setRevenuePoints] = useState<HubFinanceRevenueSeriesPoint[]>([]);
  const [ticket, setTicket] = useState<HubFinanceTicketAverageReport | null>(null);
  const [topServices, setTopServices] = useState<HubFinanceTopServicesReport | null>(null);
  const [aging, setAging] = useState<HubFinanceAgingReport | null>(null);
  const [groupStats, setGroupStats] = useState<HubAppointmentsServiceGroupStat[]>([]);
  const [clinicalAlerts, setClinicalAlerts] = useState<{ type: string; message: string }[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [staffOptions, setStaffOptions] = useState<HubStaffMember[]>([]);
  const [serviceOptions, setServiceOptions] = useState<HubServiceType[]>([]);
  const [loading, setLoading] = useState(true);

  const periodQuery = useMemo(() => periodOpts(preset), [preset]);
  const pto = useMemo(() => periodFromTo(preset), [preset]);

  const hasApptRead = hasPermission('hub.appointments.read');
  const hasClinicRead = hasPermission('hub.clinic.read');
  const hasInvRead = hasPermission('hub.inventory.read');
  const hasStaffRead = hasPermission('hub.staff.read');
  const hasServiceTypesRead = hasPermission('hub.service_types.read');

  useEffect(() => {
    if (permLoading || !clinicId || !hasStaffRead) return;
    void hubStaffApi
      .list(clinicId, { active_only: true })
      .then((r) => setStaffOptions(r.staff ?? []))
      .catch(() => setStaffOptions([]));
  }, [clinicId, hasStaffRead, permLoading]);

  useEffect(() => {
    if (permLoading || !clinicId || !hasServiceTypesRead) return;
    void hubServiceTypesApi
      .list(clinicId, false, false, false)
      .then((r) => setServiceOptions((r.service_types ?? []).filter((s) => !s.deleted_at).slice(0, 120)))
      .catch(() => setServiceOptions([]));
  }, [clinicId, hasServiceTypesRead, permLoading]);

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const statsParams = {
        clinic_id: clinicId,
        unit_id: unitId,
        from: pto.from,
        to: pto.to,
        ...(staffFilter === '__na__' ? { hub_staff_member_id: '__na__' as const } : staffFilter ? { hub_staff_member_id: staffFilter } : {}),
        ...(serviceFilter ? { hub_service_type_id: serviceFilter } : {}),
      };

      const [s, rev, tic, top, ag, st, clin, low] = await Promise.all([
        hubFinancialApi.getDashboardSummary(clinicId, unitId, periodQuery),
        hubFinancialApi.getRevenueSeries(clinicId, unitId, { ...periodQuery, bucket: revenueBucket }),
        hubFinancialApi.getTicketAverageReport(clinicId, unitId, periodQuery),
        hubFinancialApi.getTopServicesReport(clinicId, unitId, periodQuery),
        hubFinancialApi.getAgingReport(clinicId, unitId),
        hasApptRead ? hubAppointmentsApi.getStatsByServiceGroup(statsParams) : Promise.resolve({ items: [] }),
        hasClinicRead ? hubClinicalApi.alerts(clinicId) : Promise.resolve({ alerts: [] }),
        hasInvRead ? hubInventoryApi.reports.lowStock(clinicId) : Promise.resolve({ items: [] }),
      ]);

      setSummary(s);
      setRevenuePoints(rev.points ?? []);
      setTicket(tic);
      setTopServices(top);
      setAging(ag);
      setGroupStats(st.items ?? []);
      setClinicalAlerts((clin.alerts ?? []).map((a) => ({ type: a.type, message: a.message })));
      setLowStockCount((low.items ?? []).length);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar dashboard');
      setSummary(null);
      setRevenuePoints([]);
      setTicket(null);
      setTopServices(null);
      setAging(null);
      setGroupStats([]);
      setClinicalAlerts([]);
      setLowStockCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    clinicId,
    unitId,
    periodQuery,
    pto.from,
    pto.to,
    revenueBucket,
    staffFilter,
    serviceFilter,
    hasApptRead,
    hasClinicRead,
    hasInvRead,
    showError,
  ]);

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

  const topByRevenue = useMemo(() => {
    const items = topServices?.items ?? [];
    return [...items].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [topServices]);

  const topByQty = useMemo(() => {
    const items = topServices?.items ?? [];
    return [...items].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  }, [topServices]);

  const receivedVsPending = useMemo(() => {
    const received = summary?.payments_total_period ?? 0;
    const pending = summary?.receivables_outstanding ?? 0;
    const sum = received + pending;
    return {
      received,
      pending,
      receivedPct: sum > 0 ? Math.round((received / sum) * 1000) / 10 : 0,
      pendingPct: sum > 0 ? Math.round((pending / sum) * 1000) / 10 : 0,
    };
  }, [summary]);

  const donutData = useMemo(
    () => (groupStats ?? []).map((g) => ({ name: g.label, value: g.count, key: g.service_group })),
    [groupStats],
  );

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-finance-page--dashboard">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return shell(
      <>
        <div className="hub-clientes__title-block">
          <h1 className="hub-clientes__title">Dashboard</h1>
          <p className="hub-clientes__subtitle">Visão da unidade</p>
        </div>
        <p className="hub-clientes__muted">
          O dashboard financeiro requer a permissão de leitura financeira. Use as áreas de operação ou peça acesso à
          gestão.
        </p>
      </>,
    );
  }

  if (!clinicId || !unitId) {
    return shell(<p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para ver o dashboard.</p>);
  }

  const periodLabel = summary ? `${summary.period.from} — ${summary.period.to}` : '—';
  const revChartHeight = 280;
  const hBarHeight = Math.max(220, topByRevenue.length * 36 + 40);

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Dashboard</h1>
        <p className="hub-clientes__subtitle">
          Período: {periodLabel}. Receita = pagamentos no período (mesma base do Caixa).
        </p>
      </div>

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
            <option value="365">Últimos 12 meses</option>
          </select>
        </div>
        {hasApptRead && (
          <>
            <div className="hub-servicos__filter-field">
              <span className="hub-clientes__label">Profissional</span>
              <select
                className="hub-clientes__select-input"
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                aria-label="Filtrar por profissional"
              >
                <option value="">Todos</option>
                <option value="__na__">Sem profissional</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name || s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="hub-servicos__filter-field">
              <span className="hub-clientes__label">Serviço</span>
              <select
                className="hub-clientes__select-input"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                aria-label="Filtrar por tipo de serviço"
              >
                <option value="">Todos</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary hub-dash__toolbar-btn"
          onClick={() => void load()}
          disabled={loading}
        >
          Atualizar
        </button>
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
          <div className="hub-dash__kpi-hint">Recebíveis criados no período</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Ticket médio</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : formatBrl(ticket?.ticket_average ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Média por recebível</div>
        </div>
        <div className="hub-dash__panel hub-dash__kpi-card">
          <div className="hub-dash__kpi-label">Pets atendidos</div>
          <div className="hub-dash__kpi-value">{loading ? '—' : String(summary?.pets_attended_distinct ?? 0)}</div>
          <div className="hub-dash__kpi-hint">Pets distintos na agenda</div>
        </div>
      </div>

      <div className="hub-dash__two-col hub-dash__two-col--hero">
        <section className="hub-dash__panel hub-dash__panel--hero" aria-labelledby="dash-revenue-series-title">
          <div className="hub-dash__panel-head">
            <div>
              <h2 id="dash-revenue-series-title" className="hub-dash__panel-title">
                Receita por período
              </h2>
              <p className="hub-dash__panel-sub">Pagamentos consolidados (tendência).</p>
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
          <div className="hub-dash__chart-wrap" style={{ height: revChartHeight }}>
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
        </section>

        <section className="hub-dash__panel hub-dash__panel--side" aria-labelledby="dash-top-rev-title">
          <h2 id="dash-top-rev-title" className="hub-dash__panel-title">
            Top serviços por faturamento
          </h2>
          <div className="hub-dash__chart-wrap" style={{ height: hBarHeight }}>
            {loading ? (
              <div className="hub-dash__chart-skeleton" />
            ) : topByRevenue.length === 0 ? (
              <p className="hub-clientes__muted">Sem linhas de serviço no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topByRevenue} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ded8" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11, fill: '#4a3b3a' }}
                    tickFormatter={(v) => (String(v).length > 18 ? `${String(v).slice(0, 18)}…` : String(v))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v: number) => [formatBrl(Number(v)), 'Total']} contentStyle={{ borderRadius: 10 }} />
                  <Bar dataKey="total" fill="#f0642f" radius={[0, 6, 6, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <div className="hub-dash__two-col">
        <section className="hub-dash__panel" aria-labelledby="dash-top-qty-title">
          <h2 id="dash-top-qty-title" className="hub-dash__panel-title">
            Serviços mais vendidos (quantidade)
          </h2>
          <div className="hub-dash__chart-wrap" style={{ height: Math.max(220, topByQty.length * 36 + 40) }}>
            {loading ? (
              <div className="hub-dash__chart-skeleton" />
            ) : topByQty.length === 0 ? (
              <p className="hub-clientes__muted">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={topByQty} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ded8" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={108}
                    tick={{ fontSize: 11, fill: '#4a3b3a' }}
                    tickFormatter={(v) => (String(v).length > 18 ? `${String(v).slice(0, 18)}…` : String(v))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v: number) => [String(v), 'Qtd']} contentStyle={{ borderRadius: 10 }} />
                  <Bar dataKey="quantity" fill="#94a3b8" radius={[0, 6, 6, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="hub-dash__panel" aria-labelledby="dash-cat-title">
          <h2 id="dash-cat-title" className="hub-dash__panel-title">
            Atendimentos por categoria
          </h2>
          {!hasApptRead ? (
            <p className="hub-clientes__muted">É necessária permissão de agenda para ver este gráfico.</p>
          ) : loading ? (
            <div className="hub-dash__chart-skeleton hub-dash__chart-skeleton--round" />
          ) : donutData.length === 0 ? (
            <p className="hub-clientes__muted">Sem agendamentos no período.</p>
          ) : (
            <div className="hub-dash__chart-wrap hub-dash__chart-wrap--donut" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={donutData[i]?.key ?? i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [String(v), 'Atendimentos']} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="hub-dash__two-col">
        <section className="hub-dash__panel" aria-labelledby="dash-rec-pend-title">
          <h2 id="dash-rec-pend-title" className="hub-dash__panel-title">
            Recebido no período × pendente a receber
          </h2>
          <p className="hub-dash__panel-sub">
            Recebido: pagamentos no período. Pendente: saldo em aberto de recebíveis (visão atual).
          </p>
          <div className="hub-dash__compare">
            <div className="hub-dash__compare-row">
              <span>Recebido no período</span>
              <strong>{loading ? '—' : formatBrl(receivedVsPending.received)}</strong>
            </div>
            <div className="hub-dash__compare-bar">
              <div
                className="hub-dash__compare-seg hub-dash__compare-seg--ok"
                style={{ width: `${receivedVsPending.receivedPct}%` }}
              />
              <div
                className="hub-dash__compare-seg hub-dash__compare-seg--pend"
                style={{ width: `${receivedVsPending.pendingPct}%` }}
              />
            </div>
            <div className="hub-dash__compare-row">
              <span>Pendente (recebíveis em aberto)</span>
              <strong>{loading ? '—' : formatBrl(receivedVsPending.pending)}</strong>
            </div>
          </div>
        </section>

        <section className="hub-dash__panel" aria-labelledby="dash-alerts-title">
          <h2 id="dash-alerts-title" className="hub-dash__panel-title">
            Precisa de atenção
          </h2>
          <div className="hub-dash__alerts">
            <div className="hub-dash__alert-card">
              <AlertCircle size={20} strokeWidth={1.75} aria-hidden />
              <div>
                <div className="hub-dash__alert-title">Cobrança pendente</div>
                <div className="hub-dash__alert-meta">
                  {loading ? '—' : `${summary?.pending_billing_count ?? 0} itens sem cobrança`}
                </div>
              </div>
              <Link className="hub-dash__alert-cta" to="/hub/caixa">
                Ver Caixa <ArrowRight size={14} />
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
              <Link className="hub-dash__alert-cta" to="/hub/relatorios">
                Ver relatórios <ArrowRight size={14} />
              </Link>
            </div>
            {hasClinicRead && clinicalAlerts.length > 0 && (
              <div className="hub-dash__alert-card">
                <Syringe size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="hub-dash__alert-title">Vacinas / clínica</div>
                  <div className="hub-dash__alert-meta">{clinicalAlerts.length} alerta(s) nos próximos 30 dias</div>
                </div>
                <Link className="hub-dash__alert-cta" to="/hub/clinica">
                  Ver Clínica <ArrowRight size={14} />
                </Link>
              </div>
            )}
            {hasInvRead && lowStockCount > 0 && (
              <div className="hub-dash__alert-card">
                <Package size={20} strokeWidth={1.75} aria-hidden />
                <div>
                  <div className="hub-dash__alert-title">Estoque baixo</div>
                  <div className="hub-dash__alert-meta">{lowStockCount} item(ns) abaixo do mínimo</div>
                </div>
                <Link className="hub-dash__alert-cta" to="/hub/estoque">
                  Ver Estoque <ArrowRight size={14} />
                </Link>
              </div>
            )}
            <div className="hub-dash__alert-card">
              <div>
                <div className="hub-dash__alert-title">Operação e despesas</div>
                <div className="hub-dash__alert-meta">
                  Despesas no período: {loading ? '—' : formatBrl(summary?.expenses_total_period ?? 0)} · Saldo
                  operacional: {loading ? '—' : formatBrl(summary?.net_operational_period ?? 0)}
                </div>
              </div>
              <Link className="hub-dash__alert-cta" to="/hub/financeiro">
                Financeiro <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>,
  );
};

export default HubDashboardPage;
