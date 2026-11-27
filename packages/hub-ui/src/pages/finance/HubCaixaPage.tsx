import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Coins,
  ExternalLink,
  Loader2,
  Lock,
  Unlock,
  Package,
  Pencil,
  RotateCcw,
  Search,
  SendHorizonal,
  ShoppingBag,
  User,
  X,
} from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { HubDayNav } from '../../components/HubDayNav';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { formatYmd } from '../../utils/hubCalendar';
import { isPreviousDaySaoPaulo, ymdSaoPaulo } from '../../utils/ymdSaoPaulo';
import {
  hubFinancialApi,
  type HubFinanceDayBoardItem,
  type HubCashSession,
  type HubCashSessionSummary,
  type HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { CaixaMetricsRow } from './CaixaMetricsRow';
import { CaixaSessionMovementsCard } from './CaixaSessionMovementsCard';
import { CaixaShiftBreakdown } from './CaixaShiftBreakdown';
import {
  caixaCarryoverConferenceLabel,
  canCaixaEditOpenComanda,
  canHandoffCarryoverComanda,
  isCaixaCarryoverPendingComanda,
  isCaixaOwnedDayBoardItem,
  resolveCaixaCarryoverConferenceKind,
} from './hubComandaEditUtils';
import { ClientesPagination } from '../clientes/ClientesPagination';
import { enviarPendentesAoFinanceiro } from './caixaHandoffUtils';
import {
  buildCaixaSessionHistoryItems,
  sumDayBoardPendingAmount,
  sumOpenComandasPendingAmount,
  type CaixaSessionHistoryItem,
} from './hubCaixaSessionHistory';
import { CaixaSessionHistoryTimeline } from './CaixaSessionHistoryTimeline';
import { FinanceDayBoardTable, operationalStatusLabel } from './FinanceDayBoardTable';
import { BatchChargeDrawer } from './BatchChargeDrawer';
import {
  applyVisitKeysToBatchItems,
  assertSameGuardian,
  dayBoardItemToBatchChargeItem,
  isDayBoardBatchSelectable,
  type BatchChargeItem,
} from './batchChargeItems';
import { SellPackageDrawer } from './SellPackageDrawer';
import { QuickSaleDrawer } from './QuickSaleDrawer';
import { EncerrarTurnoDrawer } from './EncerrarTurnoDrawer';
import { IniciarTurnoDrawer } from './IniciarTurnoDrawer';
import { HubComandaReceivableDrawer } from './HubComandaReceivableDrawer';
import { HubReceivableCancelPanel } from './HubReceivableCancelPanel';
import HubPaymentReversalPanel from './HubPaymentReversalPanel';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { PackageSaleScheduleContext } from './packageSaleScheduleUtils';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import { filterEnabledPaymentMethods } from '../../utils/hubPaymentMethods';
import {
  formatComandaListTitle,
  formatComandaOriginLabel,
} from './comandaListPreview';
import { MarkExecutionModal, type MarkExecutionTarget } from './MarkExecutionModal';
import { CaixaConferencePanel } from './CaixaConferencePanel';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function ymdToday(): string {
  return ymdSaoPaulo();
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const HubCaixaPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess, showWarning, showConfirm } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const [pending, setPending] = useState(0);
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId && unitId ? `${clinicId}:${unitId}` : null,
  );
  const [cashOpen, setCashOpen] = useState<HubCashSession | null>(null);
  const [cashChecked, setCashChecked] = useState(false);
  const [cashSummary, setCashSummary] = useState<HubCashSessionSummary | null>(null);
  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movAmount, setMovAmount] = useState('');
  const [movNotes, setMovNotes] = useState('');
  const [selectedCashItem, setSelectedCashItem] = useState<CaixaSessionHistoryItem | null>(null);
  const [openComandas, setOpenComandas] = useState<Array<Record<string, unknown>>>([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<HubPaymentMethod[]>([]);
  const [showSangriaPanel, setShowSangriaPanel] = useState(false);

  // Day board
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [dayBoardDate, setDayBoardDate] = useState(() => ymdToday());
  const [dayBoardBusy, setDayBoardBusy] = useState(false);
  const [atendimentosStatusFilter, setAtendimentosStatusFilter] = useState<'all' | 'sem_comanda' | 'comanda_aberta' | 'a_receber' | 'recebido'>(() => {
    const status = searchParams.get('status');
    if (status === 'sem_comanda' || status === 'comanda_aberta' || status === 'a_receber' || status === 'recebido') {
      return status;
    }
    return 'all';
  });
  const [dayBoardSearch, setDayBoardSearch] = useState(() => searchParams.get('q')?.trim() ?? '');
  const [dayBoardPage, setDayBoardPage] = useState(1);
  const [dayBoardPageSize, setDayBoardPageSize] = useState(25);
  const [carryoverPage, setCarryoverPage] = useState(1);
  const [carryoverPageSize, setCarryoverPageSize] = useState(25);
  const [openComandasBusy, setOpenComandasBusy] = useState(false);
  const [handoffReadyBusy, setHandoffReadyBusy] = useState(false);

  // Drawers
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [checkoutScheduleContext, setCheckoutScheduleContext] = useState<PackageSaleScheduleContext | null>(null);
  const [receivableDrawer, setReceivableDrawer] = useState<{
    comandaId: string;
    receivableIds: string[];
    selectedReceivableId: string;
    highlightPayment?: boolean;
  } | null>(null);
  const [showSellPackage, setShowSellPackage] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [showBatchCharge, setShowBatchCharge] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchChargeItem[]>([]);
  const [showEncerrarTurno, setShowEncerrarTurno] = useState(false);
  const [cancelReceivableId, setCancelReceivableId] = useState<string | null>(null);
  const [showEstornos, setShowEstornos] = useState(false);
  const [showIniciarTurno, setShowIniciarTurno] = useState(false);
  const [closedSessions, setClosedSessions] = useState<HubCashSession[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [viewedClosedSessionId, setViewedClosedSessionId] = useState<string | null>(null);
  const [closedSessionSummary, setClosedSessionSummary] = useState<HubCashSessionSummary | null>(null);
  const [closedSessionBusy, setClosedSessionBusy] = useState(false);
  const [markExecutionItem, setMarkExecutionItem] = useState<
    MarkExecutionTarget | HubFinanceDayBoardItem | null
  >(null);
  const [conferenceComanda, setConferenceComanda] = useState<Record<string, unknown> | null>(null);
  const [sendingComandaId, setSendingComandaId] = useState<string | null>(null);
  const [sendingDayBoardKey, setSendingDayBoardKey] = useState<string | null>(null);

  // Sessão de dia anterior aberta (dia civil America/Sao_Paulo)
  const isPreviousDaySession = isPreviousDaySaoPaulo(cashOpen?.opened_at);

  const canFinancialWrite = hasPermission('hub.financial.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');
  const canReversePayments = hasPermission('hub.payments.reverse');

  const loadDayBoard = useCallback(
    async (dateOverride?: string) => {
      if (!clinicId || !unitId) return;
      const date = dateOverride ?? dayBoardDate;
      setDayBoardBusy(true);
      try {
        const result = await hubFinancialApi.getDayBoard(clinicId, unitId, date);
        setDayBoardItems(result);
      } catch {
        // Silencioso — o toast de erro aparece no load principal
      } finally {
        setDayBoardBusy(false);
      }
    },
    [clinicId, unitId, dayBoardDate]
  );

  /** Carryover / comandas abertas — enrich leve (sem N+1 de cura/saldo). */
  const loadOpenComandas = useCallback(async () => {
    if (!clinicId || !unitId) return;
    setOpenComandasBusy(true);
    try {
      const comandasRes = await hubComandaApi
        .listComandas({ clinic_id: clinicId, unit_id: unitId, status: 'aberta', enrich: 'light' })
        .catch(() => ({ comandas: [] as Array<Record<string, unknown>> }));
      setOpenComandas(comandasRes.comandas ?? []);
    } finally {
      setOpenComandasBusy(false);
    }
  }, [clinicId, unitId]);

  /** Após mutação de conferência / executor: carryover + day board. */
  const refreshAfterConference = useCallback(async () => {
    await Promise.all([loadOpenComandas(), loadDayBoard()]);
  }, [loadOpenComandas, loadDayBoard]);

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      finish();
      return;
    }
    const refreshingNow = begin();
    if (!refreshingNow) {
      setCashOpen(null);
      setCashChecked(false);
    }
    try {
      // Sessão + day board em paralelo — a listagem não espera o open da gaveta.
      const [cash, dayBoard] = await Promise.all([
        hubFinancialApi.getCashSessionOpen(clinicId, unitId),
        hubFinancialApi
          .getDayBoard(clinicId, unitId, dayBoardDate)
          .catch(() => [] as HubFinanceDayBoardItem[]),
      ]);
      const open = cash.cash_session ?? null;
      setCashChecked(true);
      setDayBoardItems(dayBoard);
      succeed();
      void loadOpenComandas();
      void hubFinancialApi
        .getPendingBillingCount(clinicId, unitId)
        .then((c) => setPending(c))
        .catch(() => setPending(0));
      void hubFinancialApi
        .listClosedCashSessions(clinicId, unitId, 10)
        .then((closedRes) => setClosedSessions(closedRes.sessions ?? []))
        .catch(() => setClosedSessions([]));
      if (!open?.id) {
        setCashOpen(null);
        setCashSummary(null);
        setAcceptedPaymentMethods([]);
        return;
      }
      setCashOpen(open);
      void hubFinancialApi
        .getCashSessionSummary(open.id, clinicId)
        .then((summary) => setCashSummary(summary))
        .catch(() => undefined);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar caixa');
    } finally {
      finish();
    }
  }, [clinicId, unitId, dayBoardDate, showError, begin, succeed, finish, loadOpenComandas]);

  useEffect(() => {
    if (!permLoading && hasPermission('hub.financial.read')) void load();
  }, [permLoading, hasPermission, load]);

  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
    if (dateParam === dayBoardDate) return;
    setDayBoardDate(dateParam);
    if (clinicId && unitId && cashOpen?.id) {
      void loadDayBoard(dateParam);
    }
  }, [searchParams, clinicId, unitId, dayBoardDate, loadDayBoard, cashOpen?.id]);

  useEffect(() => {
    const status = searchParams.get('status');
    if (
      status === 'sem_comanda' ||
      status === 'comanda_aberta' ||
      status === 'a_receber' ||
      status === 'recebido' ||
      status === 'all'
    ) {
      setAtendimentosStatusFilter(status === 'all' ? 'all' : status);
    }
  }, [searchParams]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q == null) return;
    setDayBoardSearch(q.trim());
  }, [searchParams]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setDayBoardPage(1);
    setCarryoverPage(1);
  }, [dayBoardDate, atendimentosStatusFilter, dayBoardSearch]);

  useEffect(() => {
    if (!clinicId || !cashOpen?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
        if (!cancelled) {
          setAcceptedPaymentMethods(filterEnabledPaymentMethods(res.accepted_payment_methods ?? []));
        }
      } catch {
        if (!cancelled) {
          setAcceptedPaymentMethods(filterEnabledPaymentMethods([]));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, cashOpen?.id]);

  useEffect(() => {
    if (!cashOpen) {
      setShowSangriaPanel(false);
      setShowEstornos(false);
    }
  }, [cashOpen]);

  const dayBoardFiltered = useMemo(() => {
    const searchTerm = normalizeText(dayBoardSearch.trim());
    let result = dayBoardItems.filter(isCaixaOwnedDayBoardItem);
    if (searchTerm) {
      result = result.filter((item) => {
        const guardian = normalizeText(item.guardian?.full_name ?? '');
        const pet = normalizeText(item.pet?.name ?? '');
        const svcNames = normalizeText((item.services ?? []).map((s) => s.name).join(' '));
        const label = normalizeText(item.origin_label ?? '');
        return guardian.includes(searchTerm) || pet.includes(searchTerm) || svcNames.includes(searchTerm) || label.includes(searchTerm);
      });
    }

    if (atendimentosStatusFilter !== 'all') {
      result = result.filter((it) => {
        if (atendimentosStatusFilter === 'sem_comanda') return !it.billing.comanda_id && !it.billing.receivable_status;
        if (atendimentosStatusFilter === 'comanda_aberta') {
          return it.billing.comanda_id && it.billing.comanda_status === 'aberta' && !it.billing.receivable_status;
        }
        if (atendimentosStatusFilter === 'a_receber') {
          return it.billing.receivable_status === 'pending' || it.billing.receivable_status === 'partially_paid';
        }
        if (atendimentosStatusFilter === 'recebido') return it.billing.receivable_status === 'paid';
        return true;
      });
    }

    return result;
  }, [dayBoardItems, dayBoardSearch, atendimentosStatusFilter]);

  const pendingOpenComandasInUnit = useMemo(
    () => openComandas.filter((c) => canCaixaEditOpenComanda(c)),
    [openComandas],
  );

  const extraComandas = useMemo(() => {
    if (atendimentosStatusFilter !== 'all' && atendimentosStatusFilter !== 'comanda_aberta') return [];
    const today = ymdToday();
    const searchTerm = normalizeText(dayBoardSearch.trim());
    return openComandas.filter((c) => {
      if (!isCaixaCarryoverPendingComanda(c, today)) return false;
      if (!searchTerm) return true;
      const guardian = normalizeText((c.guardian as { full_name?: string } | null)?.full_name ?? '');
      const pet = normalizeText((c.pet as { name?: string } | null)?.name ?? '');
      const title = normalizeText(formatComandaListTitle(c));
      return guardian.includes(searchTerm) || pet.includes(searchTerm) || title.includes(searchTerm);
    });
  }, [openComandas, atendimentosStatusFilter, dayBoardSearch]);

  const readyCarryoverComandas = useMemo(
    () => extraComandas.filter((c) => canHandoffCarryoverComanda(c)),
    [extraComandas],
  );

  const dayBoardPaged = useMemo(() => {
    const start = (dayBoardPage - 1) * dayBoardPageSize;
    return dayBoardFiltered.slice(start, start + dayBoardPageSize);
  }, [dayBoardFiltered, dayBoardPage, dayBoardPageSize]);

  const extraComandasPaged = useMemo(() => {
    const start = (carryoverPage - 1) * carryoverPageSize;
    return extraComandas.slice(start, start + carryoverPageSize);
  }, [extraComandas, carryoverPage, carryoverPageSize]);

  const expectedBalance = cashSummary?.summary.expected_balance ?? Number(cashOpen?.opening_balance ?? 0);

  const methodsEntries = useMemo(() => {
    const totals =
      cashSummary?.summary.shift_totals_by_method ?? cashSummary?.summary.totals_by_method ?? {};
    return acceptedPaymentMethods.map(
      (method) => [method, Number(totals[method] ?? 0)] as const,
    );
  }, [cashSummary, acceptedPaymentMethods]);

  const methodsTotal = useMemo(() => {
    if (cashSummary?.summary.shift_received_total != null) {
      return Number(cashSummary.summary.shift_received_total);
    }
    return methodsEntries.reduce((sum, [, total]) => sum + Number(total), 0);
  }, [cashSummary, methodsEntries]);

  const dayBoardComandaIds = useMemo(
    () => new Set(dayBoardItems.map((item) => item.billing.comanda_id).filter(Boolean).map(String)),
    [dayBoardItems],
  );

  const dayPendingTotal = useMemo(
    () => round2(
      sumDayBoardPendingAmount(dayBoardItems)
      + sumOpenComandasPendingAmount(openComandas, dayBoardComandaIds),
    ),
    [dayBoardItems, openComandas, dayBoardComandaIds],
  );

  const sessionHistoryItems = useMemo(
    () => buildCaixaSessionHistoryItems(cashSummary, dayBoardItems, openComandas),
    [cashSummary, dayBoardItems, openComandas],
  );

  const dayBoardItemKey = (item: HubFinanceDayBoardItem) => `${item.origin_type}:${item.origin_id}`;

  const selectedDayBoardItems = useMemo(
    () => dayBoardFiltered.filter((it) => selectedKeys.has(dayBoardItemKey(it))),
    [dayBoardFiltered, selectedKeys],
  );

  if (!permLoading && !hasPermission('hub.financial.read')) {
    return <Navigate to="/hub/clientes" replace />;
  }

  const shell = (children: React.ReactNode, panel?: React.ReactNode) => (
    <div className="hub-clientes hub-servicos-page hub-finance-page hub-caixa-page">
      <div className="hub-clientes__main">{children}</div>
      {panel}
    </div>
  );

  if (!clinicId || !unitId) {
    return shell(
      <p className="hub-clientes__muted">Selecione uma unidade no cabeçalho para usar o Caixa.</p>,
    );
  }

  if (!cashOpen) {
    if (loading || !cashChecked) {
      if (!loading && !cashChecked && !permLoading) {
        return shell(
          <div className="hub-caixa-page__closed">
            <p className="hub-caixa-page__closed-text">Não foi possível verificar o caixa.</p>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => void load()}
            >
              Tentar de novo
            </button>
          </div>,
        );
      }
      return shell(<HubLoading variant="block" label="Verificando o caixa…" />);
    }

    const closedHistoryWhenNoOpen = closedSessions.length > 0 ? (
      <section className="hub-finance-page__section" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="hub-clientes__form-title"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 0,
            fontWeight: 700,
            fontSize: 15,
            color: '#1a1a1a',
          }}
          onClick={() => setShowSessionHistory((v) => !v)}
        >
          Sessões anteriores ({closedSessions.length})
          {showSessionHistory ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        </button>
        {showSessionHistory && (
          <div className="hub-caixa-page__session-history">
            <ul className="hub-caixa-page__session-history-list">
              {closedSessions.map((sess) => {
                const selected = viewedClosedSessionId === sess.id;
                return (
                  <li key={sess.id}>
                    <button
                      type="button"
                      className={`hub-caixa-page__session-history-btn${selected ? ' hub-caixa-page__session-history-btn--selected' : ''}`}
                      onClick={() => {
                        void (async () => {
                          if (viewedClosedSessionId === sess.id) {
                            setViewedClosedSessionId(null);
                            setClosedSessionSummary(null);
                            return;
                          }
                          setViewedClosedSessionId(sess.id);
                          setClosedSessionBusy(true);
                          try {
                            const summary = await hubFinancialApi.getCashSessionSummary(sess.id, clinicId);
                            setClosedSessionSummary(summary);
                          } catch (e) {
                            showError((e as Error)?.message || 'Erro ao carregar sessão fechada');
                            setViewedClosedSessionId(null);
                            setClosedSessionSummary(null);
                          } finally {
                            setClosedSessionBusy(false);
                          }
                        })();
                      }}
                    >
                      <span className="hub-caixa-page__session-history-date">
                        {sess.closed_at
                          ? new Date(sess.closed_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Sessão'}
                        {sess.auto_closed ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#64748b',
                            }}
                          >
                            · Automático
                          </span>
                        ) : null}
                      </span>
                      <span className="hub-caixa-page__session-history-meta">
                        esperado{' '}
                        {sess.expected_balance != null ? formatBrl(Number(sess.expected_balance)) : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {closedSessionBusy ? (
              <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
                Carregando snapshot da sessão…
              </p>
            ) : null}
            {closedSessionSummary && viewedClosedSessionId ? (
              <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
                  Snapshot congelado no fechamento
                  {closedSessionSummary.summary?.snapshot_frozen ? ' (imutável)' : ''}.
                  {closedSessionSummary.cash_session?.auto_closed
                    ? ' Fechamento automático (sem contagem física).'
                    : null}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
                  <span>
                    Esperado:{' '}
                    <strong>{formatBrl(Number(closedSessionSummary.summary?.expected_balance ?? 0))}</strong>
                  </span>
                  <span>
                    Contado:{' '}
                    <strong>{formatBrl(Number(closedSessionSummary.summary?.closing_balance ?? 0))}</strong>
                  </span>
                  <span>
                    Diferença:{' '}
                    <strong>{formatBrl(Number(closedSessionSummary.summary?.difference_amount ?? 0))}</strong>
                  </span>
                </div>
                {(closedSessionSummary.post_close_adjustments ?? []).length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <h3 className="hub-clientes__form-title" style={{ fontSize: 14 }}>
                      Ajustes após fechamento
                    </h3>
                    <ul className="hub-clientes__muted" style={{ marginTop: 6, paddingLeft: 18 }}>
                      {closedSessionSummary.post_close_adjustments!.map((adj) => (
                        <li key={adj.id}>
                          {adj.effective_date} · {adj.adjustment_type} · {formatBrl(Number(adj.amount))}
                          {' — '}
                          {adj.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
                    Nenhum ajuste pós-fechamento nesta sessão.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </section>
    ) : null;

    return shell(
      <>
        <HubRefreshingBanner show={refreshing} label="Abrindo o caixa…" />
        <div className="hub-caixa-page__closed">
          <div className="hub-caixa-page__closed-icon" aria-hidden>
            <Lock size={28} strokeWidth={1.75} />
          </div>
          <h2 className="hub-caixa-page__closed-title">Caixa fechado</h2>
          <p className="hub-caixa-page__closed-text">Inicie o turno para operar o caixa.</p>
          {pendingOpenComandasInUnit.length > 0 ? (
            <div className="hub-finance-page__context-warning" role="alert" style={{ marginTop: 16, maxWidth: 520 }}>
              <AlertCircle size={16} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Há {pendingOpenComandasInUnit.length}{' '}
              {pendingOpenComandasInUnit.length === 1 ? 'comanda aberta' : 'comandas abertas'} nesta unidade
              {pendingOpenComandasInUnit.length === 1 ? '' : ''} (sem envio ao financeiro). Inicie o turno para
              cancelar, cobrar ou enviar ao financeiro — o financeiro continuará mostrando este aviso até resolver.
            </div>
          ) : null}
          {hasPermission('hub.cash.session') && (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => setShowIniciarTurno(true)}
            >
              <Unlock size={15} strokeWidth={2} />
              Iniciar turno
            </button>
          )}
        </div>
        {closedHistoryWhenNoOpen}
        <IniciarTurnoDrawer
          open={showIniciarTurno}
          onClose={() => setShowIniciarTurno(false)}
          clinicId={clinicId}
          unitId={unitId}
          onOpened={async () => {
            setShowIniciarTurno(false);
            showSuccess('Turno iniciado.');
            await load();
          }}
        />
      </>,
    );
  }

  // ── Day board handlers ───────────────────────────────────────────────────

  const resolveDayBoardComandaOrigin = (
    item: HubFinanceDayBoardItem,
  ): { origin_type: 'appointment' | 'grooming_session' | 'encounter' | 'boarding_reservation' | 'quote'; origin_id: string } | null => {
    if (item.origin_type === 'hospitalization') {
      if (item.billing_origin_type && item.billing_origin_id) {
        return { origin_type: item.billing_origin_type, origin_id: item.billing_origin_id };
      }
      return null;
    }
    if (
      item.origin_type === 'appointment' ||
      item.origin_type === 'grooming_session' ||
      item.origin_type === 'encounter' ||
      item.origin_type === 'boarding_reservation' ||
      item.origin_type === 'quote'
    ) {
      return {
        origin_type: item.origin_type,
        origin_id: item.origin_id,
      };
    }
    return null;
  };

  const onOpenComanda = async (item: HubFinanceDayBoardItem) => {
    if (!canCreateReceivable) { showError('Sem permissão para abrir comanda.'); return; }
    if (item.coverage_kind === 'series_invoice' && item.series_invoice_comanda_id) {
      navigate(`/hub/caixa/comanda/${item.series_invoice_comanda_id}`);
      return;
    }
    if (item.coverage_kind === 'series_pending') {
      showError(
        'Esta ocorrência faz parte de uma série com fatura mensal. A cobrança será lançada na fatura da série, não no caixa do dia.',
      );
      return;
    }
    const origin = resolveDayBoardComandaOrigin(item);
    if (!origin) {
      showError('Não foi possível determinar a origem da comanda para esta internação.');
      return;
    }
    setDayBoardBusy(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: origin.origin_type,
        origin_id: origin.origin_id,
        unit_id: unitId,
      });
      const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
      showSuccess('Comanda aberta.');
      if (comandaId) navigate(`/hub/caixa/comanda/${comandaId}`);
      else await loadDayBoard();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('Já existe comanda aberta')) {
        await loadDayBoard();
        showError('Já existe uma comanda aberta para este atendimento. Use o botão Editar.');
      } else {
        showError(msg || 'Erro ao abrir comanda');
      }
    } finally {
      setDayBoardBusy(false);
    }
  };

  const onEditComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    const comanda = openComandas.find((c) => String(c.id) === item.billing.comanda_id);
    if (comanda?.finance_handoff_at) {
      navigate(`/hub/financeiro/comanda/${item.billing.comanda_id}`);
    } else {
      navigate(`/hub/caixa/comanda/${item.billing.comanda_id}`);
    }
  };

  const onViewComanda = (item: HubFinanceDayBoardItem) => {
    if (!item.billing.comanda_id) return;
    navigate(`/hub/caixa/comanda/${item.billing.comanda_id}`);
  };

  const onShareComanda = (item: HubFinanceDayBoardItem) => {
    if (item.billing.comanda_id) {
      navigate(`/hub/caixa/comanda/${item.billing.comanda_id}/pronto-para-envio`);
    }
  };

  const onCancelReceivableFromBoard = (item: HubFinanceDayBoardItem) => {
    if (!canFinancialWrite) {
      showError('Sem permissão para cancelar recebíveis.');
      return;
    }
    const receivableId = item.billing.active_receivable_id;
    if (!receivableId) return;
    setCancelReceivableId(receivableId);
  };

  const onCheckoutFromBoard = (item: HubFinanceDayBoardItem) => {
    if (item.billing.comanda_id) setCheckoutComandaId(item.billing.comanda_id);
  };

  const openReceivableSidePanel = (
    comandaId: string,
    receivableId: string,
    opts?: { highlightPayment?: boolean },
  ) => {
    setSelectedCashItem(null);
    setReceivableDrawer({
      comandaId,
      receivableIds: [receivableId],
      selectedReceivableId: receivableId,
      highlightPayment: opts?.highlightPayment === true,
    });
  };

  const openComandaFromHistory = (comandaId: string) => {
    setSelectedCashItem(null);
    setReceivableDrawer(null);
    const open = openComandas.find((c) => String(c.id) === comandaId);
    if (open?.finance_handoff_at) {
      navigate(`/hub/financeiro/comanda/${comandaId}`);
      return;
    }
    // Side panel da comanda (ComandaCheckoutDrawer / HubSidePanel).
    setCheckoutComandaId(comandaId);
  };

  const findDayBoardItemForHistory = (item: CaixaSessionHistoryItem): HubFinanceDayBoardItem | null => {
    if (item.comanda_id) {
      const byComanda = dayBoardItems.find((it) => String(it.billing.comanda_id ?? '') === String(item.comanda_id));
      if (byComanda) return byComanda;
    }
    if (item.origin_type && item.origin_id) {
      return (
        dayBoardItems.find(
          (it) => it.origin_type === item.origin_type && String(it.origin_id) === String(item.origin_id),
        ) ?? null
      );
    }
    return null;
  };

  const onSelectSessionHistory = (item: CaixaSessionHistoryItem) => {
    setReceivableDrawer(null);

    const comandaId = item.comanda_id ? String(item.comanda_id) : '';
    const receivableId = item.receivable_id ? String(item.receivable_id) : '';

    // Pagamento / cobrança com recebível + comanda → side panel real da cobrança
    if (receivableId && comandaId) {
      openReceivableSidePanel(comandaId, receivableId, {
        highlightPayment: item.row_kind === 'payment',
      });
      return;
    }

    // Pagamento com recebível sem comanda → financeiro (cobrança avulsa)
    if (item.row_kind === 'payment' && receivableId && !comandaId) {
      setSelectedCashItem(null);
      navigate(`/hub/financeiro?receivable_id=${encodeURIComponent(receivableId)}`);
      return;
    }

    // Comanda (aberta / criada) → side panel da comanda
    if (comandaId) {
      openComandaFromHistory(comandaId);
      return;
    }

    // Billing com comanda descoberta no day board → abre a comanda
    if (item.row_kind === 'billing' && item.origin_type && item.origin_id) {
      const boardItem = findDayBoardItemForHistory(item);
      if (boardItem?.billing.comanda_id) {
        openComandaFromHistory(String(boardItem.billing.comanda_id));
        return;
      }
      // Sem comanda: só o painel de detalhe (CTA “Abrir comanda” no footer).
    }

    // Sangria / suprimento / sem comanda → detalhe com ações no side panel
    setSelectedCashItem(item);
  };

  const toggleSelect = (item: HubFinanceDayBoardItem) => {
    const key = dayBoardItemKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllSelectable = () => {
    const selectable = dayBoardFiltered.filter(isDayBoardBatchSelectable);
    const allOn = selectable.length > 0 && selectable.every((it) => selectedKeys.has(dayBoardItemKey(it)));
    if (allOn) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(selectable.map(dayBoardItemKey)));
  };

  const openBatchFromSelection = () => {
    if (!canCreateReceivable) {
      showError('Sem permissão para cobrar.');
      return;
    }
    const mapped = selectedDayBoardItems
      .map(dayBoardItemToBatchChargeItem)
      .filter((x): x is BatchChargeItem => Boolean(x));
    const items = applyVisitKeysToBatchItems(mapped, selectedDayBoardItems);
    if (items.length === 0) {
      showError('Selecione ao menos uma cobrança elegível.');
      return;
    }
    try {
      assertSameGuardian(items);
    } catch (e) {
      showError((e as Error).message);
      return;
    }
    if (items.length === 1) {
      const only = items[0];
      if (only.comandaId) {
        setCheckoutComandaId(only.comandaId);
        return;
      }
    }
    setBatchItems(items);
    setShowBatchCharge(true);
  };

  const onWaiveFromBoard = async (item: HubFinanceDayBoardItem) => {
    if (!canFinancialWrite) { showError('Sem permissão para marcar sem cobrança.'); return; }
    const reason = window.prompt('Motivo para não cobrar este atendimento (mín. 3 caracteres):');
    if (!reason || reason.trim().length < 3) return;
    setDayBoardBusy(true);
    try {
      await hubFinancialApi.waiveBilling({
        clinic_id: clinicId,
        source_type: item.origin_type as import('../../api/hubFinancialApi').HubFinanceUnbilledSourceType,
        source_id: item.origin_id,
        reason: reason.trim(),
      });
      showSuccess('Registrado como sem cobrança.');
      await loadDayBoard();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar');
    } finally {
      setDayBoardBusy(false);
    }
  };

  const onMarkExecutionFromBoard = (item: HubFinanceDayBoardItem) => {
    setMarkExecutionItem(item);
  };

  const onSendToFinanceiro = async (item: HubFinanceDayBoardItem) => {
    if (!canCreateReceivable) { showError('Sem permissão para enviar ao financeiro.'); return; }
    setDayBoardBusy(true);
    setSendingDayBoardKey(`${item.origin_type}:${item.origin_id}`);
    try {
      let comandaId = item.billing.comanda_id;
      if (!comandaId) {
        const origin = resolveDayBoardComandaOrigin(item);
        if (!origin) {
          showError('Não foi possível determinar a origem da comanda para esta internação.');
          return;
        }
        const detail = await hubComandaApi.openComanda({
          clinic_id: clinicId,
          origin_type: origin.origin_type,
          origin_id: origin.origin_id,
          unit_id: unitId,
        });
        comandaId = (detail.comanda as Record<string, unknown>).id as string;
      }
      const dueDate = item.starts_at?.slice(0, 10) ?? ymdToday();
      await hubComandaApi.checkoutBulk({
        clinic_id: clinicId,
        unit_id: unitId,
        comanda_ids: [comandaId],
        action: 'leave_pending',
        due_date: dueDate,
      });
      showSuccess('Enviado ao financeiro como pendente.');
      await load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar ao financeiro');
    } finally {
      setDayBoardBusy(false);
      setSendingDayBoardKey(null);
    }
  };

  const onSendCarryoverToFinanceiro = async (comandaId: string): Promise<boolean> => {
    if (!canCreateReceivable) {
      showError('Sem permissão para enviar ao financeiro.');
      return false;
    }
    setDayBoardBusy(true);
    setSendingComandaId(comandaId);
    try {
      await hubComandaApi.checkoutBulk({
        clinic_id: clinicId,
        unit_id: unitId,
        comanda_ids: [comandaId],
        action: 'leave_pending',
        due_date: ymdToday(),
      });
      showSuccess('Enviado ao financeiro como pendente.');
      await refreshAfterConference();
      return true;
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar ao financeiro');
      return false;
    } finally {
      setDayBoardBusy(false);
      setSendingComandaId(null);
    }
  };

  const conferenceIndex = conferenceComanda
    ? extraComandas.findIndex((c) => String(c.id) === String(conferenceComanda.id))
    : -1;

  const goToConferenceOffset = (delta: number) => {
    if (extraComandas.length === 0) return;
    const base = conferenceIndex >= 0 ? conferenceIndex : 0;
    const next = (base + delta + extraComandas.length) % extraComandas.length;
    setConferenceComanda(extraComandas[next] ?? null);
  };

  const advanceConferenceAfter = (
    comandaId: string,
    snapshot: Record<string, unknown>[],
    doneMessage: string,
  ) => {
    const idx = snapshot.findIndex((c) => String(c.id) === comandaId);
    const remaining =
      idx >= 0
        ? [...snapshot.slice(idx + 1), ...snapshot.slice(0, idx)]
        : snapshot.filter((c) => String(c.id) !== comandaId);
    if (remaining.length === 0) {
      setConferenceComanda(null);
      showSuccess(`${doneMessage} Todas as pendências da conferência foram resolvidas.`);
      return;
    }
    setConferenceComanda(remaining[0]);
  };

  const onSendFromConference = async (comandaId: string) => {
    const snapshot = extraComandas;
    const ok = await onSendCarryoverToFinanceiro(comandaId);
    if (!ok) return;
    advanceConferenceAfter(comandaId, snapshot, 'Enviado ao financeiro.');
  };

  const onHandoffReadyCarryoverBatch = () => {
    if (!canCreateReceivable || !clinicId || !unitId) return;
    if (readyCarryoverComandas.length === 0) {
      showError('Nenhuma pendência pronta para enviar ao financeiro.');
      return;
    }
    showConfirm(
      `Enviar ${readyCarryoverComandas.length} ${
        readyCarryoverComandas.length === 1 ? 'comanda pronta' : 'comandas prontas'
      } ao financeiro?`,
      async () => {
        setHandoffReadyBusy(true);
        try {
          const ids = readyCarryoverComandas.map((c) => String(c.id));
          const res = await hubComandaApi.checkoutBulk({
            clinic_id: clinicId,
            unit_id: unitId,
            comanda_ids: ids,
            action: 'leave_pending',
            due_date: ymdToday(),
          });
          const failed = (res.results ?? []).filter((r) => r.error);
          const okCount = (res.results ?? []).filter((r) => !r.error).length;
          if (failed.length > 0) {
            showError(failed.slice(0, 3).map((r) => r.error).join('; '));
          } else {
            showSuccess(okCount ? `${okCount} enviada(s) ao financeiro.` : 'Nada a enviar.');
          }
          await loadOpenComandas();
          await loadDayBoard();
        } catch (e: unknown) {
          try {
            const r = await enviarPendentesAoFinanceiro(clinicId, unitId);
            if (!r.success) {
              showError(r.errors[0] ?? 'Erro ao enviar ao financeiro');
            } else {
              showSuccess(
                r.handoffCount ? `${r.handoffCount} enviada(s) ao financeiro.` : 'Nada a enviar.',
              );
            }
            await loadOpenComandas();
            await loadDayBoard();
          } catch (err: unknown) {
            showError((err as Error)?.message || (e as Error)?.message || 'Erro ao enviar ao financeiro');
          }
        } finally {
          setHandoffReadyBusy(false);
        }
      },
    );
  };

  const closeSangriaPanel = () => {
    setShowSangriaPanel(false);
    setMovAmount('');
    setMovNotes('');
    setMovType('withdrawal');
  };

  const onCashMovement = async () => {
    if (!cashOpen?.id) return;
    if (!hasPermission('hub.cash.session')) { showError('Sem permissão para movimentar caixa.'); return; }
    const v = Number(String(movAmount).replace(',', '.'));
    if (Number.isNaN(v) || v <= 0) { showError('Valor inválido.'); return; }
    try {
      await hubFinancialApi.createCashMovement(cashOpen.id, { clinic_id: clinicId, movement_type: movType, amount: v, notes: movNotes.trim() || null });
      showSuccess(movType === 'withdrawal' ? 'Sangria registrada.' : 'Suprimento registrado.');
      closeSangriaPanel();
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar movimento');
    }
  };

  return shell(
    <>
      {isPreviousDaySession && (
        <div className="hub-finance-page__context-warning" role="alert">
          <AlertCircle size={16} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Há um turno aberto de um dia anterior. Encerre o turno e inicie um novo para o dia de hoje.
        </div>
      )}
      <div className="hub-caixa-page__session-bar">
        <div className="hub-caixa-page__session-meta">
          {cashOpen?.opened_by_staff && !isPreviousDaySession ? (
            <>
              <User size={13} aria-hidden />
              <span>
                Caixa aberto por{' '}
                <strong>
                  {cashOpen.opened_by_staff.display_name ?? cashOpen.opened_by_staff.full_name ?? 'desconhecido'}
                </strong>
                {cashOpen.opened_at &&
                  ` às ${new Date(cashOpen.opened_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </>
          ) : null}
        </div>
        <div className="hub-caixa-page__session-actions">
          {cashOpen ? (
            <>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={!canCreateReceivable}
                onClick={() => setShowQuickSale(true)}
              >
                <ShoppingBag size={15} strokeWidth={2} />
                Venda rápida
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                disabled={!canCreateReceivable}
                onClick={() => setShowSellPackage(true)}
              >
                <Package size={15} strokeWidth={2} />
                Vender pacote
              </button>
              {canReversePayments ? (
                <button
                  type="button"
                  className={`hub-clientes__btn hub-clientes__btn--ghost${showEstornos ? ' hub-caixa-page__session-action--active' : ''}`}
                  aria-expanded={showEstornos}
                  title="Estornar pagamentos (inclui venda rápida de dias anteriores)"
                  onClick={() => {
                    setShowSangriaPanel(false);
                    setShowEstornos(true);
                  }}
                >
                  <RotateCcw size={15} strokeWidth={2} aria-hidden />
                  Estornos
                </button>
              ) : null}
              <button
                type="button"
                className={`hub-clientes__btn hub-clientes__btn--ghost${showSangriaPanel ? ' hub-caixa-page__session-action--active' : ''}`}
                aria-expanded={showSangriaPanel}
                title="Sangria: retirada de dinheiro da gaveta. Suprimento: entrada de dinheiro na gaveta."
                onClick={() => {
                  setShowEstornos(false);
                  setShowSangriaPanel(true);
                }}
              >
                <Coins size={15} strokeWidth={2} aria-hidden />
                Sangria / Suprimento
              </button>
              {hasPermission('hub.cash.session') ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  onClick={() => {
                    setShowEncerrarTurno(true);
                    // Atualiza o resumo ao abrir para não mostrar valores desatualizados/zerados.
                    void load();
                  }}
                >
                  <Lock size={15} strokeWidth={2} />
                  Encerrar turno
                </button>
              ) : null}
            </>
          ) : hasPermission('hub.cash.session') ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => setShowIniciarTurno(true)}
            >
              <Unlock size={15} strokeWidth={2} />
              Iniciar turno
            </button>
          ) : null}
        </div>
      </div>

      <CaixaMetricsRow
        loading={loading || refreshing}
        pending={pending}
        cashOpen={!!cashOpen}
        cashOpenedAt={cashOpen?.opened_at}
        sessionReceivedTotal={methodsTotal}
        dayPendingTotal={dayPendingTotal}
        expectedBalance={expectedBalance}
        dayBoardCount={dayBoardItems.length}
      />

      {/* ── Colunas: Movimentações | Histórico ── */}
      <div className="hub-caixa-page__ops-row">
        <div className="hub-caixa-page__col">
          <CaixaSessionMovementsCard
            cashOpen={!!cashOpen}
            loadingMethods={(loading || refreshing) && acceptedPaymentMethods.length === 0}
            methodsEntries={methodsEntries}
            methodsTotal={methodsTotal}
            depositsTotal={cashSummary?.summary.deposits_total ?? 0}
            withdrawalsTotal={cashSummary?.summary.withdrawals_total ?? 0}
            dayPendingTotal={dayPendingTotal}
            cardFeeTotal={cashSummary?.summary.card_fee_total ?? 0}
            cardNetTotal={cashSummary?.summary.card_net_total ?? 0}
            cardWithoutFeeGrossTotal={cashSummary?.summary.card_without_fee_gross_total ?? 0}
          />
        </div>

        <div className="hub-caixa-page__col">
          <div className="hub-caixa-page__card hub-caixa-page__card--ops">
            <h3
              className="hub-caixa-page__card-title"
              title="Pagamentos da sessão e cobranças do painel do dia"
            >
              Histórico da sessão
            </h3>
            {!cashOpen ? (
              <p className="hub-caixa-page__empty">Inicie o turno para ver o histórico de movimentos.</p>
            ) : sessionHistoryItems.length === 0 ? (
              <p className="hub-caixa-page__empty">Nenhuma movimentação ou cobrança no painel do dia.</p>
            ) : (
              <div className="hub-caixa-page__card-body hub-caixa-page__history-scroll">
                <CaixaSessionHistoryTimeline
                  items={sessionHistoryItems}
                  onSelect={onSelectSessionHistory}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ações pendentes do caixa ── */}
      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Ações pendentes do caixa</h2>
        <div className="hub-dayboard__toolbar">
          <HubDayNav
            dateFieldId="dayboard-date"
            className="hub-dayboard__date-nav"
            value={dayBoardDate}
            disabled={dayBoardBusy}
            onChange={(next) => {
              const iso = formatYmd(next);
              setDayBoardDate(iso);
              void loadDayBoard(iso);
            }}
          />
          {dayBoardDate !== ymdToday() && (
            <span className="hub-dayboard__date-badge">
              {dayBoardDate < ymdToday() ? 'Data passada' : 'Data futura'}
            </span>
          )}
          <div className="hub-dayboard__search-wrap">
            <Search size={14} className="hub-dayboard__search-icon" />
            <input
              type="text"
              className="hub-dayboard__search"
              placeholder="Buscar tutor, pet ou serviço…"
              value={dayBoardSearch}
              onChange={(e) => setDayBoardSearch(e.target.value)}
            />
            {dayBoardSearch && (
              <button
                type="button"
                className="hub-dayboard__search-clear"
                aria-label="Limpar busca"
                onClick={() => setDayBoardSearch('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="hub-dayboard__filter-group" role="group" aria-label="Filtrar por status">
            {([
              { id: 'all', label: 'Tudo' },
              { id: 'sem_comanda', label: 'Sem comanda' },
              { id: 'comanda_aberta', label: 'Comanda aberta' },
              { id: 'a_receber', label: 'Pendente' },
              { id: 'recebido', label: 'Pago' },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`hub-dayboard__filter-btn${atendimentosStatusFilter === f.id ? ' hub-dayboard__filter-btn--active' : ''}`}
                onClick={() => setAtendimentosStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-dayboard__refresh-btn"
            disabled={dayBoardBusy || refreshing || loading}
            onClick={() => {
              // Recarrega KPIs (summary/sessão) + painel do dia — não só o day-board.
              void load();
            }}
          >
            {dayBoardBusy || refreshing || loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        <HubRefreshingBanner show={refreshing || dayBoardBusy} label="Atualizando caixa…" />
        {selectedKeys.size > 0 && canCreateReceivable ? (
          <div className="hub-batch-charge__toolbar">
            <span className="hub-clientes__muted">{selectedKeys.size} selecionada(s)</span>
            <div className="hub-batch-charge__footer-actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                onClick={() => setSelectedKeys(new Set())}
              >
                Limpar
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={openBatchFromSelection}
              >
                <Coins size={14} strokeWidth={2} aria-hidden />
                Cobrar {selectedKeys.size}
              </button>
            </div>
          </div>
        ) : null}
        {loading && dayBoardItems.length === 0 && openComandas.length === 0 && !openComandasBusy ? (
          <HubLoading variant="block" label="Carregando ações pendentes…" />
        ) : dayBoardFiltered.length === 0 && extraComandas.length === 0 && !openComandasBusy ? (
          <div className="hub-dayboard__empty">
            Nenhuma ação pendente encontrada para esta data nesta unidade.
          </div>
        ) : (
          <>
            {dayBoardFiltered.length > 0 && (
              <>
                <FinanceDayBoardTable
                  mode="caixa"
                  items={dayBoardPaged}
                  canCreateReceivable={canCreateReceivable}
                  canFinancialWrite={canFinancialWrite}
                  onOpenComanda={onOpenComanda}
                  onEditComanda={onEditComanda}
                  onViewComanda={onViewComanda}
                  onCheckout={onCheckoutFromBoard}
                  onSendToFinanceiro={onSendToFinanceiro}
                  sendingKey={sendingDayBoardKey}
                  onWaive={onWaiveFromBoard}
                  onMarkExecution={onMarkExecutionFromBoard}
                  onShareComanda={onShareComanda}
                  onCancelReceivable={onCancelReceivableFromBoard}
                  onRowClick={onEditComanda}
                  busy={dayBoardBusy}
                  selectionEnabled={canCreateReceivable}
                  selectedKeys={selectedKeys}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAllSelectable={toggleSelectAllSelectable}
                />
                {dayBoardFiltered.length > dayBoardPageSize ? (
                  <ClientesPagination
                    page={dayBoardPage}
                    pageSize={dayBoardPageSize}
                    total={dayBoardFiltered.length}
                    entityLabel="ações"
                    onPageChange={setDayBoardPage}
                    onPageSizeChange={(n) => {
                      setDayBoardPageSize(n);
                      setDayBoardPage(1);
                    }}
                  />
                ) : null}
              </>
            )}

            {openComandasBusy && extraComandas.length === 0 ? (
              <HubLoading variant="block" label="Carregando pendentes de dias anteriores…" />
            ) : null}

            {extraComandas.length > 0 && (
                <div className="hub-dayboard__group" style={{ marginTop: 16 }}>
                  <div className="hub-dayboard__group-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="hub-dayboard__group-name">
                      Conferência — dias anteriores ({extraComandas.length})
                    </span>
                    {canCreateReceivable && readyCarryoverComandas.length > 0 ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        disabled={handoffReadyBusy || dayBoardBusy}
                        onClick={onHandoffReadyCarryoverBatch}
                      >
                        <SendHorizonal size={14} strokeWidth={2} aria-hidden />
                        Enviar prontos ao financeiro ({readyCarryoverComandas.length})
                      </button>
                    ) : null}
                  </div>
                  <p className="hub-clientes__muted" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, maxWidth: 720 }}>
                    Operação incompleta ou falta executor: abra a conferência no painel — com permissão você conclui o
                    status e marca o executor sem sair do caixa. Prontas podem ir ao financeiro sem travar o turno.
                  </p>
                  <div className="hub-clientes__table-wrap" style={{ marginTop: 10 }}>
                    <table className="hub-clientes__table hub-finance-page__table">
                      <thead>
                        <tr>
                          <th>Tutor / Pet</th>
                          <th>Origem</th>
                          <th>Situação</th>
                          <th className="hub-finance-page__th-num">A receber</th>
                          <th>Aberta em</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraComandasPaged.map((c) => {
                          const guardian = c.guardian as { full_name?: string } | null;
                          const pet = c.pet as { name?: string } | null;
                          const tutorPet = [guardian?.full_name, pet?.name].filter(Boolean).join(' / ') || '—';
                          const servicesTitle = formatComandaListTitle(c);
                          const originLabel = formatComandaOriginLabel(c.origin_type);
                          const kind = resolveCaixaCarryoverConferenceKind(c);
                          const amount = Number(c.balance_due ?? c.total_amount ?? 0);
                          const badgeClass =
                            kind === 'ready'
                              ? 'hub-dayboard__badge hub-dayboard__badge--open'
                              : kind === 'needs_executor'
                                ? 'hub-dayboard__badge hub-dayboard__badge--warn'
                                : 'hub-dayboard__badge hub-dayboard__badge--pending';
                          const conferenceLabel =
                            kind === 'origin_cancelled'
                              ? 'Conferir cancelamento'
                              : kind === 'needs_executor'
                                ? 'Conferir executor'
                                : kind === 'operational_incomplete'
                                  ? 'Conferir operação'
                                  : 'Conferir';
                          return (
                            <tr key={String(c.id)}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{tutorPet}</div>
                                <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                                  {servicesTitle}
                                </div>
                              </td>
                              <td><span className="hub-clientes__muted">{originLabel}</span></td>
                              <td>
                                <span
                                  className={badgeClass}
                                  style={
                                    kind === 'origin_cancelled'
                                      ? { background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }
                                      : undefined
                                  }
                                >
                                  {caixaCarryoverConferenceLabel(kind)}
                                </span>
                              </td>
                              <td className="hub-finance-page__td-num">{formatBrl(amount)}</td>
                              <td>
                                {c.opened_at
                                  ? new Date(String(c.opened_at)).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    })
                                  : '—'}
                              </td>
                              <td>
                                <div
                                  className="hub-dayboard__item-actions"
                                  style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}
                                >
                                  {kind === 'operational_incomplete' ||
                                  kind === 'needs_executor' ||
                                  kind === 'origin_cancelled' ? (
                                    <button
                                      type="button"
                                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                      title={conferenceLabel}
                                      aria-label={conferenceLabel}
                                      onClick={() => setConferenceComanda(c)}
                                    >
                                      <ExternalLink size={14} strokeWidth={2} aria-hidden />
                                      {conferenceLabel}
                                    </button>
                                  ) : null}
                                  {canCreateReceivable && kind === 'ready' ? (
                                    <button
                                      type="button"
                                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                                      title="Enviar ao financeiro"
                                      aria-label="Enviar ao financeiro"
                                      aria-busy={sendingComandaId === String(c.id)}
                                      disabled={dayBoardBusy}
                                      onClick={() => void onSendCarryoverToFinanceiro(String(c.id))}
                                    >
                                      {sendingComandaId === String(c.id) ? (
                                        <Loader2
                                          size={14}
                                          strokeWidth={2}
                                          className="hub-finance-page__spin"
                                          aria-hidden
                                        />
                                      ) : (
                                        <SendHorizonal size={14} strokeWidth={2} aria-hidden />
                                      )}
                                      {sendingComandaId === String(c.id) ? 'Enviando…' : 'Financeiro'}
                                    </button>
                                  ) : null}
                                  {canCreateReceivable && (
                                    <button
                                      type="button"
                                      className="hub-dayboard__action-btn"
                                      title="Editar comanda"
                                      aria-label="Editar comanda"
                                      onClick={() => navigate(`/hub/caixa/comanda/${String(c.id)}`)}
                                    >
                                      <Pencil size={15} strokeWidth={2} />
                                    </button>
                                  )}
                                  {canCreateReceivable && (
                                    <button
                                      type="button"
                                      className="hub-dayboard__action-btn hub-dayboard__action-btn--primary"
                                      title="Cobrar agora"
                                      aria-label="Cobrar agora"
                                      onClick={() => setCheckoutComandaId(String(c.id))}
                                    >
                                      <Coins size={15} strokeWidth={2} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {extraComandas.length > carryoverPageSize ? (
                    <ClientesPagination
                      page={carryoverPage}
                      pageSize={carryoverPageSize}
                      total={extraComandas.length}
                      entityLabel="pendentes"
                      onPageChange={setCarryoverPage}
                      onPageSizeChange={(n) => {
                        setCarryoverPageSize(n);
                        setCarryoverPage(1);
                      }}
                    />
                  ) : null}
                </div>
            )}
          </>
        )}
      </section>

      {cashSummary?.summary?.snapshot_frozen &&
      cashSummary?.post_close_adjustments &&
      cashSummary.post_close_adjustments.length > 0 ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Ajustes após fechamento</h2>
          <p className="hub-clientes__muted">
            O saldo conferido na sessão permanece. Estes lançamentos registram impactos posteriores (anulações ou
            reembolsos).
          </p>
          <ul className="hub-clientes__muted" style={{ marginTop: 8, paddingLeft: 18 }}>
            {cashSummary.post_close_adjustments.map((adj) => (
              <li key={adj.id}>
                {adj.effective_date} · {adj.adjustment_type} · {formatBrl(Number(adj.amount))}
                {' — '}
                {adj.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Histórico de sessões fechadas ── */}
      {closedSessions.length > 0 && (
        <section className="hub-finance-page__section">
          <button
            type="button"
            className="hub-clientes__form-title"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 0,
              fontWeight: 700,
              fontSize: 15,
              color: '#1a1a1a',
            }}
            onClick={() => setShowSessionHistory((v) => !v)}
          >
            Sessões anteriores ({closedSessions.length})
            {showSessionHistory ? (
              <ChevronUp size={16} aria-hidden />
            ) : (
              <ChevronDown size={16} aria-hidden />
            )}
          </button>
          {showSessionHistory && (
            <div style={{ marginTop: 12, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5', color: '#888' }}>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>Abertura</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>Fechamento</th>
                    <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>Operador</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Saldo esperado</th>
                    <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 600 }}>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {closedSessions.map((sess) => {
                    const diff = sess.difference_amount ?? null;
                    const diffColor =
                      diff == null ? '#888' : diff >= -0.009 ? '#065f46' : '#dc2626';
                    const operadorName = sess.auto_closed
                      ? 'Automático'
                      : (sess.opened_by_staff as { display_name?: string | null; full_name?: string | null } | null | undefined)?.display_name ??
                        (sess.opened_by_staff as { full_name?: string | null } | null | undefined)?.full_name ??
                        '—';
                    const selected = viewedClosedSessionId === sess.id;
                    return (
                      <tr
                        key={sess.id}
                        style={{
                          borderBottom: '1px solid #f0f0f0',
                          cursor: 'pointer',
                          background: selected ? '#f8fafc' : undefined,
                        }}
                        onClick={() => {
                          void (async () => {
                            if (!clinicId) return;
                            if (viewedClosedSessionId === sess.id) {
                              setViewedClosedSessionId(null);
                              setClosedSessionSummary(null);
                              return;
                            }
                            setViewedClosedSessionId(sess.id);
                            setClosedSessionBusy(true);
                            try {
                              const summary = await hubFinancialApi.getCashSessionSummary(sess.id, clinicId);
                              setClosedSessionSummary(summary);
                            } catch (e) {
                              showError((e as Error)?.message || 'Erro ao carregar sessão fechada');
                              setViewedClosedSessionId(null);
                              setClosedSessionSummary(null);
                            } finally {
                              setClosedSessionBusy(false);
                            }
                          })();
                        }}
                      >
                        <td style={{ padding: '8px 10px' }}>
                          {sess.opened_at
                            ? new Date(sess.opened_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#555' }}>
                          {sess.closed_at
                            ? new Date(sess.closed_at).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                          {sess.auto_closed ? (
                            <span style={{ display: 'block', fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                              Fechamento automático
                            </span>
                          ) : null}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#555' }}>{operadorName}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          {sess.expected_balance != null ? formatBrl(Number(sess.expected_balance)) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: diffColor, fontWeight: 600 }}>
                          {diff != null ? formatBrl(diff) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {closedSessionBusy ? (
                <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
                  Carregando snapshot da sessão…
                </p>
              ) : null}
              {closedSessionSummary && viewedClosedSessionId ? (
                <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e5e5', borderRadius: 8 }}>
                  <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
                    Snapshot congelado no fechamento
                    {closedSessionSummary.summary?.snapshot_frozen ? ' (imutável)' : ''}.
                    {closedSessionSummary.cash_session?.auto_closed
                      ? ' Fechamento automático (sem contagem física).'
                      : null}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
                    <span>
                      Esperado:{' '}
                      <strong>{formatBrl(Number(closedSessionSummary.summary?.expected_balance ?? 0))}</strong>
                    </span>
                    <span>
                      Contado:{' '}
                      <strong>{formatBrl(Number(closedSessionSummary.summary?.closing_balance ?? 0))}</strong>
                    </span>
                    <span>
                      Diferença:{' '}
                      <strong>{formatBrl(Number(closedSessionSummary.summary?.difference_amount ?? 0))}</strong>
                    </span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <CaixaShiftBreakdown
                      summary={closedSessionSummary.summary}
                      acceptedMethods={acceptedPaymentMethods}
                      compact
                    />
                  </div>
                  {(closedSessionSummary.post_close_adjustments ?? []).length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <h3 className="hub-clientes__form-title" style={{ fontSize: 14 }}>
                        Ajustes após fechamento
                      </h3>
                      <ul className="hub-clientes__muted" style={{ marginTop: 6, paddingLeft: 18 }}>
                        {closedSessionSummary.post_close_adjustments!.map((adj) => (
                          <li key={adj.id}>
                            {adj.effective_date} · {adj.adjustment_type} · {formatBrl(Number(adj.amount))}
                            {' — '}
                            {adj.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="hub-clientes__muted" style={{ marginTop: 12 }}>
                      Nenhum ajuste pós-fechamento nesta sessão.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}
    </>,
    <>
      <HubSidePanel
        open={!!cashOpen && showSangriaPanel}
        onClose={closeSangriaPanel}
        title="Sangria / Suprimento"
        titleIcon={<Coins size={20} strokeWidth={1.75} aria-hidden />}
        subtitle="Sangria retira dinheiro da gaveta; suprimento coloca dinheiro na gaveta."
        footer={
          <div className="hub-finance-page__drawer-footer">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={closeSangriaPanel}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              onClick={() => void onCashMovement()}
            >
              Registrar
            </button>
          </div>
        }
      >
        <div className="hub-caixa-page__form-row">
          <div className="hub-clientes__field">
            <span className="hub-clientes__label">Tipo</span>
            <HubSearchableCombobox
              id="caixa-mov-type"
              className="hub-combobox--clientes"
              options={[
                { value: 'withdrawal', label: 'Sangria (retirada)' },
                { value: 'deposit', label: 'Suprimento (entrada)' },
              ]}
              value={movType}
              onChange={(v) => setMovType(v as 'withdrawal' | 'deposit')}
              clearable={false}
              ariaLabel="Tipo de movimento"
            />
          </div>
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="caixa-mov-amt">
              Valor
            </label>
            <div className="hub-caixa-page__money-field">
              <span className="hub-caixa-page__money-prefix">R$</span>
              <input
                id="caixa-mov-amt"
                className="hub-clientes__input"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </div>
        </div>
        <div className="hub-caixa-page__form-row hub-caixa-page__form-row--single">
          <div className="hub-clientes__field">
            <label className="hub-clientes__label" htmlFor="caixa-mov-notes">
              Observação (opcional)
            </label>
            <input
              id="caixa-mov-notes"
              className="hub-clientes__input"
              value={movNotes}
              onChange={(e) => setMovNotes(e.target.value)}
              placeholder="Ex.: Pagamento de fornecedor"
            />
          </div>
        </div>
      </HubSidePanel>

      <HubSidePanel
        open={!!cashOpen && showEstornos && canReversePayments}
        onClose={() => setShowEstornos(false)}
        title="Estornos"
        titleIcon={<RotateCcw size={20} strokeWidth={1.75} aria-hidden />}
        subtitle="Pagamentos da unidade no período — inclusive vendas rápidas de dias anteriores."
        size="wide"
      >
        <HubPaymentReversalPanel
          context="caixa"
          embedded
          onChanged={() => {
            void load();
            void loadDayBoard();
          }}
        />
      </HubSidePanel>

      <BatchChargeDrawer
        open={showBatchCharge}
        items={batchItems}
        guardianName={
          selectedDayBoardItems.find((it) => it.guardian?.full_name)?.guardian?.full_name ?? undefined
        }
        cashSessionId={cashOpen?.id ?? null}
        onClose={() => setShowBatchCharge(false)}
        onDone={() => {
          setSelectedKeys(new Set());
          // Painel da sessão + total recebido + histórico + day-board (sem double-count: summary soma por payment id).
          void load();
          void loadDayBoard();
        }}
        onBundleCreated={(id) => navigate(`/hub/financeiro/cobranca-lote/${id}/pronto-para-envio`)}
      />

      {clinicId && checkoutComandaId && unitId ? (
        <ComandaCheckoutDrawer
          key={checkoutComandaId}
          open={!!checkoutComandaId}
          onClose={() => {
            setCheckoutComandaId(null);
            setCheckoutScheduleContext(null);
          }}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={checkoutComandaId}
          packageSaleSchedule={checkoutScheduleContext}
          onDataChanged={() => {
            void load();
            void loadDayBoard();
          }}
          onSuccess={({ comandaId, kind, receivableIds }) => {
            showSuccess(
              kind === 'leave_pending'
                ? 'Comanda enviada ao financeiro.'
                : kind === 'cancel'
                  ? 'Comanda cancelada.'
                  : 'Cobrança concluída.',
            );
            setCheckoutComandaId(null);
            setCheckoutScheduleContext(null);
            void load();
            void loadDayBoard();
            if (kind === 'leave_pending') {
              const rid = receivableIds[0];
              navigate(
                rid
                  ? `/hub/financeiro/comanda/${comandaId}?receivable_id=${rid}`
                  : `/hub/financeiro/comanda/${comandaId}`,
              );
            }
          }}
        />
      ) : null}

      {receivableDrawer ? (
        <HubComandaReceivableDrawer
          open={!!receivableDrawer}
          onClose={() => setReceivableDrawer(null)}
          comandaId={receivableDrawer.comandaId}
          receivableIds={receivableDrawer.receivableIds}
          selectedReceivableId={receivableDrawer.selectedReceivableId}
          onSelectReceivable={(id) =>
            setReceivableDrawer((prev) => (prev ? { ...prev, selectedReceivableId: id } : null))
          }
          onRefreshComanda={() => {
            // Pós-pagamento: recarrega KPIs + painel (load já inclui day-board).
            void load();
          }}
          highlightPayment={receivableDrawer.highlightPayment === true}
        />
      ) : null}

      <HubSidePanel
        open={!!selectedCashItem}
        title={(() => {
          if (!selectedCashItem) return 'Detalhe';
          if (
            selectedCashItem.row_kind === 'billing' &&
            !selectedCashItem.comanda_id
          ) {
            const board = findDayBoardItemForHistory(selectedCashItem);
            const serviceNames = (board?.services ?? []).map((s) => s.name).filter(Boolean);
            if (serviceNames.length === 1) return serviceNames[0];
            if (serviceNames.length > 1) return `${serviceNames[0]} +${serviceNames.length - 1}`;
            if (board?.origin_label?.trim()) return board.origin_label.trim();
          }
          return selectedCashItem.title || 'Detalhe';
        })()}
        subtitle={(() => {
          if (!selectedCashItem) return undefined;
          if (selectedCashItem.row_kind === 'billing' && !selectedCashItem.comanda_id) {
            const board = findDayBoardItemForHistory(selectedCashItem);
            const who = [board?.guardian?.full_name, board?.pet?.name].filter(Boolean).join(' • ');
            return who || selectedCashItem.subtitle || 'Sem comanda';
          }
          return selectedCashItem.subtitle || undefined;
        })()}
        onClose={() => setSelectedCashItem(null)}
        footer={
          <div className="hub-finance-page__drawer-footer">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={() => setSelectedCashItem(null)}
            >
              Fechar
            </button>
            {selectedCashItem?.receivable_id && selectedCashItem?.comanda_id ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                onClick={() => {
                  const rid = String(selectedCashItem.receivable_id);
                  const cid = String(selectedCashItem.comanda_id);
                  openReceivableSidePanel(cid, rid, {
                    highlightPayment: selectedCashItem.row_kind === 'payment',
                  });
                }}
              >
                Ver cobrança
              </button>
            ) : null}
            {selectedCashItem?.comanda_id && !selectedCashItem?.receivable_id ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                onClick={() => openComandaFromHistory(String(selectedCashItem.comanda_id))}
              >
                Ver comanda
              </button>
            ) : null}
            {selectedCashItem?.row_kind === 'billing' &&
            !selectedCashItem?.comanda_id &&
            selectedCashItem?.origin_type &&
            selectedCashItem?.origin_id &&
            canCreateReceivable &&
            findDayBoardItemForHistory(selectedCashItem)?.coverage_kind !== 'series_pending' ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={dayBoardBusy}
                onClick={() => {
                  if (dayBoardBusy) return;
                  const boardItem = findDayBoardItemForHistory(selectedCashItem);
                  if (!boardItem) {
                    showError('Atendimento não encontrado no painel do dia.');
                    return;
                  }
                  setSelectedCashItem(null);
                  void onOpenComanda(boardItem);
                }}
              >
                {dayBoardBusy ? 'Abrindo…' : 'Abrir comanda'}
              </button>
            ) : null}
            {selectedCashItem?.row_kind === 'payment' &&
            selectedCashItem?.receivable_id &&
            !selectedCashItem?.comanda_id ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                onClick={() => {
                  const rid = String(selectedCashItem.receivable_id);
                  setSelectedCashItem(null);
                  navigate(`/hub/financeiro?receivable_id=${encodeURIComponent(rid)}`);
                }}
              >
                Ver cobrança
              </button>
            ) : null}
          </div>
        }
      >
        {selectedCashItem ? (() => {
          const board =
            selectedCashItem.row_kind === 'billing' && !selectedCashItem.comanda_id
              ? findDayBoardItemForHistory(selectedCashItem)
              : null;
          const serviceNames = (board?.services ?? []).map((s) => s.name).filter(Boolean);
          const originLabel = board
            ? formatComandaOriginLabel(board.origin_type)
            : selectedCashItem.origin_type
              ? formatComandaOriginLabel(selectedCashItem.origin_type)
              : null;
          const startsAt = board?.starts_at || selectedCashItem.happened_at;
          const isSemComanda = selectedCashItem.row_kind === 'billing' && !selectedCashItem.comanda_id;

          return (
            <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
              <div className="hub-finance-page__detail-hero">
                <strong>{formatBrl(Number(selectedCashItem.signed_amount))}</strong>
                <span className="hub-clientes__muted">
                  {startsAt ? new Date(String(startsAt)).toLocaleString('pt-BR') : '—'}
                </span>
              </div>

              {(selectedCashItem.chips?.length ?? 0) > 0 ? (
                <div className="hub-caixa-timeline__chips" style={{ marginBottom: 10 }}>
                  {isSemComanda ? (
                    <span className="hub-caixa-timeline__chip hub-caixa-timeline__chip--mixed">
                      Sem comanda
                    </span>
                  ) : null}
                  {selectedCashItem.chips!.map((chip) => (
                    <span
                      key={chip.key}
                      className={`hub-caixa-timeline__chip hub-caixa-timeline__chip--${chip.tone}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : isSemComanda ? (
                <div className="hub-caixa-timeline__chips" style={{ marginBottom: 10 }}>
                  <span className="hub-caixa-timeline__chip hub-caixa-timeline__chip--mixed">
                    Sem comanda
                  </span>
                </div>
              ) : null}

              <section className="hub-finance-page__panel-section">
                <div className="hub-finance-page__detail-list">
                  {isSemComanda ? (
                    <>
                      <p>
                        <strong>Canal:</strong>{' '}
                        {originLabel || 'Atendimento'}
                        {board?.origin_label ? ` · ${board.origin_label}` : ''}
                      </p>
                      {serviceNames.length > 0 ? (
                        <p>
                          <strong>Serviço{serviceNames.length > 1 ? 's' : ''}:</strong>{' '}
                          {serviceNames.join(' · ')}
                        </p>
                      ) : (
                        <p>
                          <strong>Serviço:</strong> {board?.origin_label || 'Não informado'}
                        </p>
                      )}
                      <p>
                        <strong>Tutor:</strong> {board?.guardian?.full_name || '—'}
                      </p>
                      <p>
                        <strong>Pet:</strong> {board?.pet?.name || '—'}
                      </p>
                      {board?.operational_status ? (
                        <p>
                          <strong>Status do atendimento:</strong>{' '}
                          {operationalStatusLabel(board.operational_status, 'caixa')}
                        </p>
                      ) : null}
                      <p>
                        <strong>Situação no caixa:</strong> Ainda sem comanda
                      </p>
                      <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
                        Abra a comanda para registrar itens e seguir com a cobrança.
                      </p>
                    </>
                  ) : (
                    <>
                      <p><strong>Tipo:</strong> {selectedCashItem.title}</p>
                      {selectedCashItem.subtitle ? (
                        <p><strong>Detalhe:</strong> {selectedCashItem.subtitle}</p>
                      ) : null}
                      <p>
                        <strong>Origem:</strong>{' '}
                        {selectedCashItem.row_kind === 'payment'
                          ? 'Pagamento recebido na sessão'
                          : selectedCashItem.row_kind === 'billing'
                            ? 'Cobrança / comanda do painel do dia'
                            : 'Movimento manual do caixa'}
                      </p>
                      {selectedCashItem.is_pending ? (
                        <p><strong>Status:</strong> Pendente / em aberto</p>
                      ) : null}
                      {selectedCashItem.comanda_id ? (
                        <p><strong>Comanda:</strong> #{String(selectedCashItem.comanda_id).slice(0, 8)}</p>
                      ) : null}
                      {selectedCashItem.receivable_id ? (
                        <p><strong>Recebível:</strong> #{String(selectedCashItem.receivable_id).slice(0, 8)}</p>
                      ) : null}
                      <p><strong>Observações:</strong> {selectedCashItem.notes ?? '—'}</p>
                    </>
                  )}
                </div>
              </section>
            </div>
          );
        })() : null}
      </HubSidePanel>
      <SellPackageDrawer
        open={showSellPackage}
        unitId={unitId}
        onClose={() => setShowSellPackage(false)}
        onCheckout={(comandaId, intent, scheduleContext) => {
          setCheckoutComandaId(comandaId);
          setCheckoutScheduleContext(intent === 'checkout_and_schedule' ? scheduleContext : null);
        }}
      />
      <QuickSaleDrawer
        open={showQuickSale}
        unitId={unitId}
        onClose={() => setShowQuickSale(false)}
        onOpened={(comandaId) => {
          navigate(`/hub/caixa/comanda/${comandaId}`);
        }}
        onCheckout={(comandaId) => {
          setCheckoutComandaId(comandaId);
          setCheckoutScheduleContext(null);
        }}
      />
      {clinicId ? (
        <HubReceivableCancelPanel
          open={Boolean(cancelReceivableId)}
          clinicId={clinicId}
          receivableId={cancelReceivableId}
          onClose={() => setCancelReceivableId(null)}
          onSuccess={() => {
            setCancelReceivableId(null);
            void load();
          }}
        />
      ) : null}
      {showEncerrarTurno && cashOpen && (
        <EncerrarTurnoDrawer
          open={showEncerrarTurno}
          onClose={() => setShowEncerrarTurno(false)}
          clinicId={clinicId}
          cashSession={cashOpen}
          cashSummary={cashSummary}
          openComandas={openComandas}
          dayBoardItems={dayBoardItems}
          expectedBalance={expectedBalance}
          methodsTotal={methodsTotal}
          // Não travar em "Aguardando dados…" se o load falhou depois de abrir a sessão:
          // cashOpen pode existir com cashSummary ainda null (Promise.all rejeitou).
          dataLoading={(loading || refreshing) && cashSummary == null}
          onClosed={async (result) => {
            setShowEncerrarTurno(false);
            const errors = (result?.handoffErrors ?? []).filter(Boolean);
            if (errors.length > 0) {
              const detail = errors[0];
              showWarning(
                `O caixa foi fechado, mas ${errors.length} comanda(s) seguem abertas. Resolva execução, cobrança ou envio ao financeiro. ${detail}`,
                'Caixa fechado com pendências',
              );
            } else {
              showSuccess('Caixa fechado com sucesso.');
            }
            await load();
          }}
        />
      )}

      <CaixaConferencePanel
        open={!!conferenceComanda}
        comanda={
          conferenceComanda
            ? (openComandas.find((c) => String(c.id) === String(conferenceComanda.id)) ??
              conferenceComanda)
            : null
        }
        onClose={() => setConferenceComanda(null)}
        onRefresh={refreshAfterConference}
        onCheckout={(id) => setCheckoutComandaId(id)}
        onEditComanda={(id) => navigate(`/hub/caixa/comanda/${id}`)}
        onSendToFinanceiro={(id) => void onSendFromConference(id)}
        queuePosition={conferenceIndex >= 0 ? conferenceIndex + 1 : null}
        queueTotal={extraComandas.length}
        onPrev={() => goToConferenceOffset(-1)}
        onNext={() => goToConferenceOffset(1)}
        onResolved={(id) => advanceConferenceAfter(id, extraComandas, 'Comanda anulada.')}
        sendingToFinanceiro={
          !!conferenceComanda && sendingComandaId === String(conferenceComanda.id)
        }
        showError={showError}
        showSuccess={showSuccess}
        busy={dayBoardBusy || openComandasBusy}
      />

      <MarkExecutionModal
        open={!!markExecutionItem}
        item={markExecutionItem}
        onClose={() => setMarkExecutionItem(null)}
        onDone={() => {
          void refreshAfterConference();
        }}
        showError={showError}
        showSuccess={showSuccess}
      />
    </>,
  );
};

export default HubCaixaPage;
