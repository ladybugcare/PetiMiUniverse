import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Car,
  Hotel,
  Package,
  Receipt,
  Scissors,
  Stethoscope,
  Syringe,
  Wallet,
} from 'lucide-react';
import { hubOpsApi } from '../../api/hubOpsApi';
import { useAlert } from '../../components/AlertProvider';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { dayRangeIsoLocal } from '../agenda/agendaFilters';
import { loadDayOpsSummaryClient, type DayOpsPermFlags } from './loadDayOpsSummaryClient';
import { TODAY_DASHBOARD_PAGE_TITLE, TODAY_OPS_CARDS } from './todayDashboardSpec';
import type { HubDayOpsSummary } from './todayOpsTypes';
import '../clientes/clientes.css';
import '../servicos/servicos-page.css';
import '../finance/hub-finance-page.css';
import './hub-today-dashboard.css';

const REFRESH_MS = 75_000;

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function payableAlertMeta(count: number, total: number, unconfirmed = 0, estimated = 0): string {
  const titles = `${count} ${count === 1 ? 'título' : 'títulos'} · ${formatBrl(total)}`;
  if (unconfirmed <= 0) return titles;
  return `${titles} · ${unconfirmed} a confirmar (est. ${formatBrl(estimated)})`;
}

function formatDateLong(dateYmd: string): string {
  const [y, m, d] = dateYmd.split('-').map(Number);
  if (!y || !m || !d) return dateYmd;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function reportHref(relatorio: string, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ relatorio, ...extra });
  return `/hub/relatorios?${q}`;
}

const CARD_ICONS: Record<string, React.ElementType> = {
  agenda: CalendarDays,
  clinic: Stethoscope,
  grooming: Scissors,
  boarding: Hotel,
  pickup: Car,
};

function cardPrimary(id: string, summary: HubDayOpsSummary | null, loading: boolean): string {
  if (loading || !summary) return '—';
  switch (id) {
    case 'agenda':
      return String(summary.agenda?.total ?? 0);
    case 'clinic':
      return String(summary.clinic?.total ?? 0);
    case 'grooming':
      return String(summary.grooming?.total ?? 0);
    case 'boarding': {
      const h = summary.boarding?.hotel.current ?? 0;
      const d = summary.boarding?.daycare.current ?? 0;
      return String(h + d);
    }
    case 'pickup':
      return String(summary.pickup?.routes ?? 0);
    default:
      return '—';
  }
}

function cardSecondary(id: string, summary: HubDayOpsSummary | null, loading: boolean): string {
  if (loading || !summary) return 'Carregando…';
  switch (id) {
    case 'agenda': {
      const groups = summary.agenda?.by_group ?? [];
      if (!groups.length) return 'Nenhum agendamento hoje';
      return groups
        .slice(0, 3)
        .map((g) => `${g.label}: ${g.count}`)
        .join(' · ');
    }
    case 'clinic': {
      const c = summary.clinic;
      if (!c || c.total === 0) return 'Nenhum atendimento hoje';
      return `${c.waiting} aguardando · ${c.in_progress} em atendimento · ${c.done} concluídos`;
    }
    case 'grooming': {
      const g = summary.grooming;
      if (!g || g.total === 0) return 'Fila vazia hoje';
      return `${g.in_service} em serviço · ${g.waiting} aguardando · ${g.ready} prontos`;
    }
    case 'boarding': {
      const b = summary.boarding;
      if (!b) return 'Sem dados de ocupação';
      const hotelMax = b.hotel.max != null ? `/${b.hotel.max}` : '';
      const dayMax = b.daycare.max != null ? `/${b.daycare.max}` : '';
      return `Hotel ${b.hotel.current}${hotelMax} · Creche ${b.daycare.current}${dayMax} · ${b.checkins_today} no dia`;
    }
    case 'pickup': {
      const p = summary.pickup;
      if (!p || (p.routes === 0 && p.stops_pending === 0)) return 'Nenhuma rota hoje';
      const driverWarn = p.routes_without_driver > 0 ? ` · ${p.routes_without_driver} sem motorista` : '';
      return `${p.stops_pending} parada(s) pendente(s)${driverWarn}`;
    }
    default:
      return '';
  }
}

const HubTodayDashboardPage: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const todayYmd = useMemo(() => dayRangeIsoLocal(new Date()).dateYmd, []);

  const [summary, setSummary] = useState<HubDayOpsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const canAppointments = hasPermission('hub.appointments.read');
  const canClinic = hasPermission('hub.clinic.read');
  const canGrooming = hasPermission('grooming.queue.read');
  const canBoarding = hasPermission('boarding.reservations.read');
  const canPickup = hasPermission('pickup.routes.read');
  const canFinancial = hasPermission('hub.financial.read');
  const canInventory = hasPermission('hub.inventory.read');

  const perms: DayOpsPermFlags = useMemo(
    () => ({
      appointments: canAppointments,
      clinic: canClinic,
      grooming: canGrooming,
      boarding: canBoarding,
      pickup: canPickup,
      financial: canFinancial,
      inventory: canInventory,
    }),
    [canAppointments, canClinic, canGrooming, canBoarding, canPickup, canFinancial, canInventory],
  );

  const canAccessPage =
    canAppointments ||
    canClinic ||
    canGrooming ||
    canBoarding ||
    canPickup ||
    canFinancial ||
    canInventory;

  const visibleCards = useMemo(
    () =>
      TODAY_OPS_CARDS.filter((c) => {
        switch (c.id) {
          case 'agenda':
            return canAppointments;
          case 'clinic':
            return canClinic;
          case 'grooming':
            return canGrooming;
          case 'boarding':
            return canBoarding;
          case 'pickup':
            return canPickup;
          default:
            return false;
        }
      }),
    [canAppointments, canClinic, canGrooming, canBoarding, canPickup],
  );

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let data: HubDayOpsSummary | null = null;
      try {
        data = await hubOpsApi.getDayOpsSummary(clinicId, unitId, todayYmd);
      } catch {
        data = await loadDayOpsSummaryClient(clinicId, unitId, perms);
      }
      setSummary(data);
      setUpdatedAt(new Date());
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar o painel de hoje');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, todayYmd, perms, showError]);

  useEffect(() => {
    if (permLoading || !canAccessPage) return;
    if (!clinicId || !unitId) return;
    void load();
  }, [permLoading, canAccessPage, clinicId, unitId, load]);

  useEffect(() => {
    if (permLoading || !canAccessPage || !clinicId || !unitId) return;
    const id = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [permLoading, canAccessPage, clinicId, unitId, load]);

  const shell = (children: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-finance-page--dashboard hub-today-dash">
      <div className="hub-clientes__main">{children}</div>
    </div>
  );

  if (!permLoading && !canAccessPage) {
    return shell(
      <p className="hub-clientes__muted">
        Você não tem permissão para ver o painel operacional. Use as áreas liberadas no menu ou peça acesso à
        gestão.
      </p>,
    );
  }

  if (!clinicId || !unitId) {
    return shell(
      <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para ver o dia operacional.</p>,
    );
  }

  const alerts = summary?.alerts;
  const finance = summary?.finance;
  const hasAttention =
    Boolean(finance?.cash_open) ||
    (finance?.pending_billing ?? 0) > 0 ||
    (alerts?.overdue_receivables_count ?? 0) > 0 ||
    (alerts?.overdue_payables_count ?? 0) > 0 ||
    (alerts?.due_today_payables_count ?? 0) > 0 ||
    (alerts?.vaccines_due ?? 0) > 0 ||
    (alerts?.low_stock ?? 0) > 0 ||
    Boolean(summary?.boarding?.hotel.over_capacity) ||
    Boolean(summary?.boarding?.daycare.over_capacity) ||
    (summary?.pickup?.routes_without_driver ?? 0) > 0;

  return shell(
    <>
      <header className="hub-today-dash__header">
        <div>
          <h1 className="hub-today-dash__title">{TODAY_DASHBOARD_PAGE_TITLE}</h1>
          <p className="hub-today-dash__subtitle">
            {formatDateLong(todayYmd)}
            {updatedAt
              ? ` · atualizado às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <div className="hub-today-dash__header-actions">
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            onClick={() => void load()}
            disabled={loading}
          >
            Atualizar
          </button>
          {canFinancial ? (
            <Link className="hub-clientes__btn hub-clientes__btn--ghost" to={reportHref('finance-overview')}>
              Análise financeira
            </Link>
          ) : null}
        </div>
      </header>

      {visibleCards.length > 0 ? (
        <section className="hub-today-dash__ops" aria-labelledby="today-ops-title">
          <h2 id="today-ops-title" className="hub-dash__panel-title">
            Operação agora
          </h2>
          <p className="hub-dash__panel-sub">Resumo do dia por área. Clique para abrir a fila ou o painel.</p>
          <div className="hub-today-dash__ops-grid">
            {visibleCards.map((card) => {
              const Icon = CARD_ICONS[card.id] ?? CalendarDays;
              const primary = cardPrimary(card.id, summary, loading);
              const secondary = cardSecondary(card.id, summary, loading);
              const warn =
                (card.id === 'boarding' &&
                  (summary?.boarding?.hotel.over_capacity || summary?.boarding?.daycare.over_capacity)) ||
                (card.id === 'pickup' && (summary?.pickup?.routes_without_driver ?? 0) > 0);
              return (
                <Link
                  key={card.id}
                  to={card.href}
                  className={`hub-today-dash__ops-card${warn ? ' hub-today-dash__ops-card--warn' : ''}${loading ? ' hub-today-dash__ops-card--loading' : ''}`}
                >
                  <div className="hub-today-dash__ops-card-top">
                    <Icon size={18} strokeWidth={1.75} aria-hidden />
                    <span className="hub-today-dash__ops-card-label">{card.label}</span>
                    <ArrowRight size={14} className="hub-today-dash__ops-card-arrow" aria-hidden />
                  </div>
                  <div className="hub-today-dash__ops-card-value">{primary}</div>
                  <div className="hub-today-dash__ops-card-meta">{secondary}</div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {canFinancial ? (
        <section className="hub-today-dash__finance" aria-labelledby="today-finance-title">
          <h2 id="today-finance-title" className="hub-dash__panel-title">
            Financeiro do dia
          </h2>
          <div className="hub-dash__kpi-row hub-today-dash__finance-row">
            <div className="hub-dash__panel hub-dash__kpi-card">
              <div className="hub-dash__kpi-label">Recebido hoje</div>
              <div className="hub-dash__kpi-value">
                {loading ? '—' : formatBrl(finance?.received_today ?? 0)}
              </div>
              <div className="hub-dash__kpi-hint">Pagamentos de hoje</div>
            </div>
            <div className="hub-dash__panel hub-dash__kpi-card">
              <div className="hub-dash__kpi-label">Em aberto</div>
              <div className="hub-dash__kpi-value">
                {loading ? '—' : formatBrl(finance?.outstanding ?? 0)}
              </div>
              <div className="hub-dash__kpi-hint">Saldo de recebíveis</div>
            </div>
            <div className="hub-dash__panel hub-dash__kpi-card">
              <div className="hub-dash__kpi-label">Caixa</div>
              <div className="hub-dash__kpi-value">
                {loading ? '—' : finance?.cash_open ? 'Aberto' : 'Fechado'}
              </div>
              <div className="hub-dash__kpi-hint">
                <Link className="hub-finance-page__dash-link" to="/hub/caixa">
                  Ir para o Caixa
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="hub-dash__two-col" style={{ marginTop: 18 }}>
        <section className="hub-dash__panel" aria-labelledby="today-alerts-title">
          <h2 id="today-alerts-title" className="hub-dash__panel-title">
            Precisa de atenção
          </h2>
          {!hasAttention && !loading ? (
            <p className="hub-clientes__muted">Nada urgente no momento.</p>
          ) : (
            <div className="hub-dash__alerts">
              {finance?.cash_open ? (
                <div className="hub-dash__alert-card">
                  <Wallet size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Caixa aberto</div>
                    <div className="hub-dash__alert-meta">
                      {finance.cash_opened_at
                        ? `Desde ${new Date(finance.cash_opened_at).toLocaleString('pt-BR', {
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

              {canFinancial && (finance?.pending_billing ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Cobrança não gerada</div>
                    <div className="hub-dash__alert-meta">{finance?.pending_billing} itens sem cobrança</div>
                  </div>
                  <Link className="hub-dash__alert-cta" to={reportHref('unbilled', { days: '30' })}>
                    Ver relatório <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {canFinancial && (alerts?.overdue_receivables_count ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Receipt size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Recebíveis vencidos</div>
                    <div className="hub-dash__alert-meta">
                      {alerts?.overdue_receivables_count} títulos ·{' '}
                      {formatBrl(alerts?.overdue_receivables_total ?? 0)}
                    </div>
                  </div>
                  <Link className="hub-dash__alert-cta" to={reportHref('pending-payments')}>
                    Pagamentos pendentes <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {canFinancial && (alerts?.overdue_payables_count ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Wallet size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Contas a pagar vencidas</div>
                    <div className="hub-dash__alert-meta">
                      {payableAlertMeta(
                        alerts?.overdue_payables_count ?? 0,
                        alerts?.overdue_payables_total ?? 0,
                        alerts?.overdue_payables_unconfirmed_count ?? 0,
                        alerts?.overdue_payables_estimated_total ?? 0,
                      )}
                    </div>
                  </div>
                  <Link className="hub-dash__alert-cta" to="/hub/financeiro?tab=payables">
                    Contas a pagar <ArrowRight size={14} />
                  </Link>
                </div>
              ) : canFinancial && (alerts?.due_today_payables_count ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Wallet size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Contas a pagar de hoje</div>
                    <div className="hub-dash__alert-meta">
                      {payableAlertMeta(
                        alerts?.due_today_payables_count ?? 0,
                        alerts?.due_today_payables_total ?? 0,
                        alerts?.due_today_payables_unconfirmed_count ?? 0,
                        alerts?.due_today_payables_estimated_total ?? 0,
                      )}
                    </div>
                  </div>
                  <Link className="hub-dash__alert-cta" to="/hub/financeiro?tab=payables">
                    Contas a pagar <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {canClinic && (alerts?.vaccines_due ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Syringe size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Vacinas / clínica</div>
                    <div className="hub-dash__alert-meta">
                      {alerts?.vaccines_due} alerta(s) nos próximos 30 dias
                    </div>
                  </div>
                  <Link className="hub-dash__alert-cta" to={reportHref('vaccines-due', { days: '30' })}>
                    Vacinas a vencer <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {canInventory && (alerts?.low_stock ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Package size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Estoque baixo</div>
                    <div className="hub-dash__alert-meta">{alerts?.low_stock} item(ns) abaixo do mínimo</div>
                  </div>
                  <Link className="hub-dash__alert-cta" to="/hub/estoque/alertas">
                    Ver alertas <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {summary?.boarding?.hotel.over_capacity || summary?.boarding?.daycare.over_capacity ? (
                <div className="hub-dash__alert-card">
                  <Hotel size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Hotel / creche acima da capacidade</div>
                    <div className="hub-dash__alert-meta">Revise ocupação e check-outs do dia</div>
                  </div>
                  <Link className="hub-dash__alert-cta" to="/hub/hotel-creche">
                    Abrir painel <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {(summary?.pickup?.routes_without_driver ?? 0) > 0 ? (
                <div className="hub-dash__alert-card">
                  <Car size={20} strokeWidth={1.75} aria-hidden />
                  <div>
                    <div className="hub-dash__alert-title">Rotas sem motorista</div>
                    <div className="hub-dash__alert-meta">
                      {summary?.pickup?.routes_without_driver} rota(s) do dia sem motorista atribuído
                    </div>
                  </div>
                  <Link className="hub-dash__alert-cta" to="/hub/leva-e-traz">
                    Abrir leva e traz <ArrowRight size={14} />
                  </Link>
                </div>
              ) : null}

              {loading && !hasAttention ? (
                <p className="hub-clientes__muted">Carregando alertas…</p>
              ) : null}
            </div>
          )}
        </section>

        <section className="hub-dash__panel" aria-labelledby="today-shortcuts-title">
          <h2 id="today-shortcuts-title" className="hub-dash__panel-title">
            Atalhos
          </h2>
          <p className="hub-dash__panel-sub">Operação e análise — sem misturar modos.</p>
          <div className="hub-dash__shortcuts">
            {visibleCards.map((card) => (
              <Link key={card.id} className="hub-dash__shortcut" to={card.href}>
                {card.label}
                <ArrowRight size={14} aria-hidden />
              </Link>
            ))}
            {canFinancial ? (
              <>
                <Link className="hub-dash__shortcut" to="/hub/financeiro">
                  Financeiro
                  <ArrowRight size={14} aria-hidden />
                </Link>
                <Link className="hub-dash__shortcut" to={reportHref('finance-overview')}>
                  Visão financeira (período)
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </>
            ) : null}
            <Link className="hub-dash__shortcut" to="/hub/relatorios">
              Catálogo de relatórios
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </>,
  );
};

export default HubTodayDashboardPage;
