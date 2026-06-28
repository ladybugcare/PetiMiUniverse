import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  AlertCircle,
  Ban,
  FilePlus2,
  Coins,
  Layers,
  Pencil,
  Receipt,
  X,
} from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubFinancialApi,
  type HubFinanceDayBoardItem,
  type HubFinanceUnbilledItem,
  type HubCashSession,
  type HubCashSessionSummary,
} from '../../api/hubFinancialApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { ComandaCancellationResolveDrawer } from './ComandaCancellationResolveDrawer';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { CaixaMetricsRow } from './CaixaMetricsRow';
import { HubDateField } from '../../components/HubDateField';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './hub-finance-page.css';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  transfer: 'Transferência',
  payment_link: 'Link de pagamento',
  customer_credit: 'Crédito do tutor',
};

const STATUS_OP_LABEL: Record<string, string> = {
  scheduled: 'Agendado',
  checked_in: 'Check-in',
  in_progress: 'Em atendimento',
  done: 'Concluído',
  paid: 'Pago',
  grooming: 'Tosa',
  bath_and_groom: 'Banho e Tosa',
  checked_out: 'Check-out realizado',
  waiting: 'Aguardando',
  completed: 'Concluído',
};

// ─── Day Board Badge ─────────────────────────────────────────────────────────

function ComandaStatusBadge({ billing }: { billing: HubFinanceDayBoardItem['billing'] }) {
  if (billing.has_receivable && billing.comanda_status === 'fechada') {
    return <span className="hub-dayboard__badge hub-dayboard__badge--received">Recebido</span>;
  }
  if (billing.has_receivable && billing.comanda_status !== 'fechada') {
    return <span className="hub-dayboard__badge hub-dayboard__badge--pending">A receber</span>;
  }
  if (billing.comanda_id && billing.comanda_status === 'aberta') {
    return <span className="hub-dayboard__badge hub-dayboard__badge--open">Comanda aberta</span>;
  }
  return <span className="hub-dayboard__badge hub-dayboard__badge--none">Sem comanda</span>;
}

// ─── Day Board Group ─────────────────────────────────────────────────────────

type DayBoardGroupProps = {
  label: string;
  items: HubFinanceDayBoardItem[];
  totalEstimated: number;
  canCreateReceivable: boolean;
  canFinancialWrite: boolean;
  onOpenComanda: (item: HubFinanceDayBoardItem) => void;
  onEditComanda: (item: HubFinanceDayBoardItem) => void;
  onCheckout: (item: HubFinanceDayBoardItem) => void;
  onBulkCheckout?: (items: HubFinanceDayBoardItem[]) => void;
  onWaive: (item: HubFinanceDayBoardItem) => void;
  busy: boolean;
};

function DayBoardGroup({
  label,
  items,
  totalEstimated,
  canCreateReceivable,
  canFinancialWrite,
  onOpenComanda,
  onEditComanda,
  onCheckout,
  onBulkCheckout,
  onWaive,
  busy,
}: DayBoardGroupProps) {
  const openComandas = items.filter(
    (it) => it.billing.comanda_id && it.billing.comanda_status === 'aberta'
  );

  return (
    <div className="hub-dayboard__group">
      <div className="hub-dayboard__group-header">
        <span className="hub-dayboard__group-name">{label}</span>
        <span className="hub-dayboard__group-amount">{formatBrl(totalEstimated)}</span>
        <div className="hub-dayboard__group-actions">
          {/* Receber em conjunto: somente se houver 2+ comandas abertas */}
          {onBulkCheckout && openComandas.length >= 2 && canCreateReceivable && (
            <button
              type="button"
              className="hub-dayboard__action-btn"
              title="Receber todas as comandas em conjunto"
              aria-label="Receber em conjunto"
              disabled={busy}
              onClick={() => onBulkCheckout(openComandas)}
            >
              <Layers size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      {items.map((item) => {
        const hasComanda = !!item.billing.comanda_id;
        const isOpen = item.billing.comanda_status === 'aberta';
        const hasReceivable = item.billing.has_receivable;
        const opLabel = STATUS_OP_LABEL[item.operational_status] ?? item.operational_status;
        const timeStr = item.starts_at
          ? new Date(item.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : null;

        return (
          <div key={`${item.origin_type}:${item.origin_id}`} className="hub-dayboard__item">
            <div className="hub-dayboard__item-label">
              <div>{item.origin_label}</div>
              <div className="hub-dayboard__item-sub">
                {timeStr ? `${timeStr} · ` : ''}
                {opLabel}
                {item.pet ? ` · ${item.pet.name}` : ''}
              </div>
            </div>
            <ComandaStatusBadge billing={item.billing} />
            <span className="hub-dayboard__item-amount">
              {item.estimated_amount > 0 ? formatBrl(item.estimated_amount) : '—'}
            </span>
            <div className="hub-dayboard__item-actions">
              {/* Abrir comanda */}
              {!hasComanda && canCreateReceivable && (
                <button
                  type="button"
                  className="hub-dayboard__action-btn"
                  title="Abrir comanda"
                  aria-label="Abrir comanda"
                  disabled={busy}
                  onClick={() => onOpenComanda(item)}
                >
                  <FilePlus2 size={15} strokeWidth={2} />
                </button>
              )}
              {/* Editar comanda */}
              {hasComanda && isOpen && canCreateReceivable && (
                <button
                  type="button"
                  className="hub-dayboard__action-btn"
                  title="Editar comanda"
                  aria-label="Editar comanda"
                  disabled={busy}
                  onClick={() => onEditComanda(item)}
                >
                  <Pencil size={15} strokeWidth={2} />
                </button>
              )}
              {/* Receber */}
              {hasComanda && isOpen && !hasReceivable && canCreateReceivable && (
                <button
                  type="button"
                  className="hub-dayboard__action-btn hub-dayboard__action-btn--primary"
                  title="Receber"
                  aria-label="Receber"
                  disabled={busy}
                  onClick={() => onCheckout(item)}
                >
                  <Coins size={15} strokeWidth={2} />
                </button>
              )}
              {/* Ver comanda já faturada */}
              {hasComanda && hasReceivable && (
                <button
                  type="button"
                  className="hub-dayboard__action-btn"
                  title="Ver comanda"
                  aria-label="Ver comanda"
                  disabled={busy}
                  onClick={() => onCheckout(item)}
                >
                  <Receipt size={15} strokeWidth={2} />
                </button>
              )}
              {/* Sem cobrança */}
              {!hasReceivable && canFinancialWrite && (
                <button
                  type="button"
                  className="hub-dayboard__action-btn"
                  title="Marcar sem cobrança"
                  aria-label="Marcar sem cobrança"
                  disabled={busy}
                  onClick={() => onWaive(item)}
                >
                  <Ban size={15} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── HubCaixaPage ────────────────────────────────────────────────────────────

type TabId = 'atendimentos' | 'session' | 'pending' | 'reversal' | 'historico' | 'cancellation';

const HubCaixaPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const [pending, setPending] = useState(0);
  const [items, setItems] = useState<HubFinanceUnbilledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState<HubCashSession | null>(null);
  const [cashSummary, setCashSummary] = useState<HubCashSessionSummary | null>(null);
  const [tab, setTab] = useState<TabId>('atendimentos');
  const [openBal, setOpenBal] = useState('0');
  const [closeBal, setCloseBal] = useState('');
  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movAmount, setMovAmount] = useState('');
  const [movNotes, setMovNotes] = useState('');
  const [reversePaymentId, setReversePaymentId] = useState('');
  const [selectedCashItem, setSelectedCashItem] = useState<Record<string, unknown> | null>(null);
  const [openComandas, setOpenComandas] = useState<Array<Record<string, unknown>>>([]);
  const [cancellationPendingCount, setCancellationPendingCount] = useState(0);
  const [cancellationQueue, setCancellationQueue] = useState<Array<Record<string, unknown>>>([]);
  const [resolveComanda, setResolveComanda] = useState<Record<string, unknown> | null>(null);
  const [closedSessions, setClosedSessions] = useState<HubCashSession[]>([]);

  // Day board
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [dayBoardDate, setDayBoardDate] = useState(() => ymdToday());
  const [dayBoardGroupBy, setDayBoardGroupBy] = useState<'tutor' | 'pet'>('tutor');
  const [dayBoardBusy, setDayBoardBusy] = useState(false);
  const [atendimentosStatusFilter, setAtendimentosStatusFilter] = useState<'all' | 'sem_comanda' | 'comanda_aberta' | 'a_receber' | 'recebido'>('all');

  // Drawers
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseTargetId, setReverseTargetId] = useState<string | null>(null);

  // Sessão de dia anterior aberta
  const isPreviousDaySession = cashOpen?.opened_at
    ? new Date(cashOpen.opened_at).toISOString().slice(0, 10) < ymdToday()
    : false;

  const canFinancialWrite = hasPermission('hub.financial.write');
  const canCreateReceivable = hasPermission('hub.receivables.create');

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

  const load = useCallback(async () => {
    if (!clinicId || !unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, list, cash, comandasRes, cancelCountRes, cancelQueueRes, closedRes, dayBoard] = await Promise.all([
        hubFinancialApi.getPendingBillingCount(clinicId, unitId),
        hubFinancialApi.listUnbilledCompleted(clinicId, unitId),
        hubFinancialApi.getCashSessionOpen(clinicId, unitId),
        hubComandaApi.listComandas({ clinic_id: clinicId, unit_id: unitId, status: 'aberta', enrich: true }).catch(() => ({ comandas: [] })),
        hubComandaApi.getCancellationPendingCount(clinicId, unitId).catch(() => ({ count: 0 })),
        hubComandaApi.listCancellationPending({ clinic_id: clinicId, unit_id: unitId }).catch(() => ({ comandas: [] })),
        hubFinancialApi.listClosedCashSessions(clinicId, unitId, 25).catch(() => ({ sessions: [] })),
        hubFinancialApi.getDayBoard(clinicId, unitId, dayBoardDate).catch(() => [] as HubFinanceDayBoardItem[]),
      ]);
      setPending(c);
      setItems(list);
      setOpenComandas(comandasRes.comandas ?? []);
      setCancellationPendingCount(cancelCountRes.count ?? 0);
      setCancellationQueue(cancelQueueRes.comandas ?? []);
      setClosedSessions(closedRes.sessions ?? []);
      setDayBoardItems(dayBoard);
      const open = cash.cash_session ?? null;
      setCashOpen(open);
      if (open?.id) {
        setCashSummary(await hubFinancialApi.getCashSessionSummary(open.id, clinicId));
      } else {
        setCashSummary(null);
      }
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar caixa');
    } finally {
      setLoading(false);
    }
  }, [clinicId, unitId, dayBoardDate, showError]);

  useEffect(() => {
    if (!permLoading && hasPermission('hub.financial.read')) void load();
  }, [permLoading, hasPermission, load]);

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

  // ── Day board handlers ───────────────────────────────────────────────────

  const onOpenComanda = async (item: HubFinanceDayBoardItem) => {
    if (!canCreateReceivable) { showError('Sem permissão para abrir comanda.'); return; }
    setDayBoardBusy(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: item.origin_type as 'appointment' | 'grooming_session' | 'encounter' | 'boarding_reservation',
        origin_id: item.origin_id,
        unit_id: unitId,
      });
      const comandaId = (detail.comanda as Record<string, unknown>)?.id as string | undefined;
      showSuccess('Comanda aberta.');
      if (comandaId) navigate(`/hub/caixa/comanda/${comandaId}`);
      else await loadDayBoard();
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('Já existe comanda aberta')) {
        // Tentar abrir a comanda existente
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
    if (item.billing.comanda_id) navigate(`/hub/caixa/comanda/${item.billing.comanda_id}`);
  };

  const onCheckoutFromBoard = (item: HubFinanceDayBoardItem) => {
    if (item.billing.comanda_id) setCheckoutComandaId(item.billing.comanda_id);
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

  const onBulkCheckout = async (openItems: HubFinanceDayBoardItem[]) => {
    if (!canCreateReceivable) { showError('Sem permissão para receber comandas.'); return; }
    const ids = openItems.map((it) => it.billing.comanda_id!);
    const confirmed = await new Promise<boolean>((res) => {
      showConfirm(
        `Deseja enviar ${ids.length} comanda(s) ao financeiro para recebimento conjunto?`,
        () => res(true),
        'Enviar ao financeiro'
      );
      setTimeout(() => res(false), 60_000);
    });
    if (!confirmed) return;
    setDayBoardBusy(true);
    try {
      const result = await hubComandaApi.checkoutBulk({
        clinic_id: clinicId,
        unit_id: unitId,
        comanda_ids: ids,
        action: 'leave_pending',
        due_date: ymdToday(),
        payment_timing: 'on_checkout',
      });
      if (result.partial_errors) {
        showError('Algumas comandas não puderam ser processadas. Verifique individualmente.');
      } else {
        showSuccess(`${ids.length} comanda(s) enviada(s) ao financeiro.`);
      }
      await loadDayBoard();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao processar bulk checkout');
    } finally {
      setDayBoardBusy(false);
    }
  };

  // ── Groups ───────────────────────────────────────────────────────────────

  const dayBoardGroups = useMemo(() => {
    const map = new Map<string, HubFinanceDayBoardItem[]>();
    for (const item of dayBoardItems) {
      const key =
        dayBoardGroupBy === 'tutor'
          ? item.guardian_id ?? `unknown-${item.origin_id}`
          : item.pet_id ?? `unknown-${item.origin_id}`;
      const label =
        dayBoardGroupBy === 'tutor'
          ? item.guardian?.full_name ?? 'Tutor desconhecido'
          : item.pet?.name ?? 'Pet desconhecido';
      const existing = map.get(key);
      if (existing) {
        existing.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return Array.from(map.entries()).map(([key, groupItems]) => {
      const label =
        dayBoardGroupBy === 'tutor'
          ? groupItems[0]?.guardian?.full_name ?? 'Tutor desconhecido'
          : groupItems[0]?.pet?.name ?? 'Pet desconhecido';
      const totalEstimated = groupItems.reduce((s, it) => s + (it.estimated_amount ?? 0), 0);
      return { key, label, items: groupItems, totalEstimated };
    });
  }, [dayBoardItems, dayBoardGroupBy]);

  // ── Legacy handlers ──────────────────────────────────────────────────────

  const onGerarCobranca = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.receivables.create')) { showError('Sem permissão para gerar cobrança.'); return; }
    if (!window.confirm(`Gerar cobrança de ${formatBrl(row.estimated_amount)} (${row.origin_label})?`)) return;
    try {
      await hubFinancialApi.createReceivable({ clinic_id: clinicId, source_type: row.source_type, source_id: row.source_id });
      showSuccess('Cobrança criada.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao gerar cobrança');
    }
  };

  const onWaive = async (row: HubFinanceUnbilledItem) => {
    if (!hasPermission('hub.financial.write')) { showError('Sem permissão para marcar sem cobrança.'); return; }
    const reason = window.prompt('Motivo para não cobrar este atendimento (mín. 3 caracteres):');
    if (!reason || reason.trim().length < 3) return;
    try {
      await hubFinancialApi.waiveBilling({ clinic_id: clinicId, source_type: row.source_type, source_id: row.source_id, reason: reason.trim() });
      showSuccess('Registado como sem cobrança.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar');
    }
  };

  const onOpenCash = async () => {
    if (!hasPermission('hub.cash.session')) { showError('Sem permissão para abrir caixa.'); return; }
    const v = Number(String(openBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) { showError('Saldo inicial inválido.'); return; }
    try {
      await hubFinancialApi.openCashSession({ clinic_id: clinicId, unit_id: unitId, opening_balance: v });
      showSuccess('Caixa aberto.');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao abrir caixa');
    }
  };

  const executarFechamentoCaixa = async (sessionId: string, v: number) => {
    try {
      await hubFinancialApi.closeCashSession(sessionId, { clinic_id: clinicId, closing_balance: v });
      showSuccess('Caixa fechado.');
      setCloseBal('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao fechar caixa');
    }
  };

  /**
   * Envia todas as comandas abertas ao financeiro antes de fechar o caixa.
   * Retorna true se todas foram enviadas com sucesso (ou se não havia nenhuma).
   */
  const enviarComandasAbertas = async (): Promise<boolean> => {
    const today = ymdToday();
    const abertas = openComandas.filter((c) => c.status === 'aberta');
    if (abertas.length === 0) return true;
    const erros: string[] = [];
    for (const c of abertas) {
      try {
        await hubComandaApi.checkout(String(c.id), {
          clinic_id: clinicId,
          grouping: 'all',
          action: 'leave_pending',
          due_date: today,
          payment_timing: 'on_checkout',
        });
      } catch (e: unknown) {
        erros.push(`${String(c.id).slice(0, 8)}: ${(e as Error)?.message ?? 'Erro'}`);
      }
    }
    if (erros.length > 0) {
      showError(`Falha ao enviar ${erros.length} comanda(s) ao financeiro:\n${erros.join('\n')}`);
      return false;
    }
    return true;
  };

  const onCloseCash = () => {
    if (!cashOpen?.id) return;
    const sessionId = cashOpen.id;
    const v = Number(String(closeBal).replace(',', '.'));
    if (Number.isNaN(v) || v < 0) { showError('Saldo de fecho inválido.'); return; }
    const abertas = openComandas.filter((c) => c.status === 'aberta');
    if (abertas.length > 0) {
      showConfirm(
        `Há ${abertas.length} comanda(s) em aberto. Ao fechar o caixa, esses itens serão enviados ao financeiro (cobrança pendente). Deseja continuar?`,
        async () => {
          const ok = await enviarComandasAbertas();
          if (ok) void executarFechamentoCaixa(sessionId, v);
        },
        'Fechar caixa e enviar ao financeiro',
      );
      return;
    }
    void executarFechamentoCaixa(sessionId, v);
  };

  const onCashMovement = async () => {
    if (!cashOpen?.id) return;
    if (!hasPermission('hub.cash.session')) { showError('Sem permissão para movimentar caixa.'); return; }
    const v = Number(String(movAmount).replace(',', '.'));
    if (Number.isNaN(v) || v <= 0) { showError('Valor inválido.'); return; }
    try {
      await hubFinancialApi.createCashMovement(cashOpen.id, { clinic_id: clinicId, movement_type: movType, amount: v, notes: movNotes.trim() || null });
      showSuccess(movType === 'withdrawal' ? 'Sangria registada.' : 'Suprimento registado.');
      setMovAmount('');
      setMovNotes('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registar movimento');
    }
  };

  const onReverseConfirm = async () => {
    if (!clinicId) return;
    if (!hasPermission('hub.cash.receive')) { showError('Sem permissão para estornar pagamentos.'); return; }
    const paymentId = (reverseTargetId ?? reversePaymentId).trim();
    if (!paymentId) { showError('Informe o ID do pagamento.'); return; }
    if (!reverseReason.trim() || reverseReason.trim().length < 3) { showError('Informe o motivo do estorno (mín. 3 caracteres).'); return; }
    try {
      const res = await hubFinancialApi.reversePayment(paymentId, { clinic_id: clinicId, reason: reverseReason.trim() });
      showSuccess(res.warning || 'Pagamento estornado e recebível recalculado.');
      setReversePaymentId('');
      setReverseReason('');
      setReverseTargetId(null);
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

  const expectedBalance = cashSummary?.summary.expected_balance ?? Number(cashOpen?.opening_balance ?? 0);
  const closeInformedNum = useMemo(() => {
    const t = String(closeBal).trim();
    if (!t) return null;
    const v = Number(t.replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  }, [closeBal]);
  const closeDiffPreview = closeInformedNum != null && cashOpen
    ? Math.round((closeInformedNum - expectedBalance + Number.EPSILON) * 100) / 100
    : null;
  const cashRows = useMemo(() => {
    const payments = (cashSummary?.payments ?? []).map((payment) => ({
      ...payment,
      row_kind: 'payment',
      label: 'Recebimento em dinheiro',
      signed_amount: Number(payment.amount ?? 0),
      happened_at: payment.payment_date,
    }));
    const movements = (cashSummary?.movements ?? []).map((movement) => ({
      ...movement,
      row_kind: 'movement',
      label: movement.movement_type === 'deposit' ? 'Suprimento' : 'Sangria',
      signed_amount: movement.movement_type === 'deposit' ? Number(movement.amount ?? 0) : -Number(movement.amount ?? 0),
      happened_at: movement.created_at,
    }));
    return [...payments, ...movements].sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)));
  }, [cashSummary]);

  return shell(
    <>
      <div className="hub-clientes__title-block">
        <h1 className="hub-clientes__title">Caixa</h1>
        <p className="hub-clientes__subtitle">Central de cobrança da unidade.</p>
      </div>

      {/* Aviso de sessão de dia anterior */}
      {isPreviousDaySession && (
        <div className="hub-finance-page__context-warning" role="alert">
          <AlertCircle size={16} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Há uma sessão de caixa aberta de um dia anterior. Feche-a e abra uma nova sessão para o dia de hoje.
        </div>
      )}

      <HubTabs
        ariaLabel="Seções do caixa"
        items={[
          { id: 'atendimentos', label: 'Atendimentos' },
          { id: 'session', label: 'Sessão do caixa' },
          { id: 'cancellation', label: 'Ajustes por cancelamento' },
          { id: 'pending', label: 'Pendentes de cobrança' },
          { id: 'historico', label: 'Sessões fechadas' },
          { id: 'reversal', label: 'Estornos' },
        ]}
        activeId={tab}
        onTabChange={(id) => {
          setTab(id as TabId);
          setSelectedCashItem(null);
        }}
      />

      <CaixaMetricsRow
        loading={loading}
        pending={pending}
        cashOpen={!!cashOpen}
        cashOpenedAt={cashOpen?.opened_at}
        cashPaymentsTotal={cashSummary?.summary.cash_payments_total ?? 0}
        expectedBalance={expectedBalance}
        cancellationPendingCount={cancellationPendingCount}
        dayBoardCount={dayBoardItems.length}
      />

      {/* ── Aba: Atendimentos (unificado: dia + a receber) ── */}
      {tab === 'atendimentos' && (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Atendimentos</h2>
          <div className="hub-dayboard__toolbar">
            <HubDateField
              id="dayboard-date"
              label="Data"
              valueIso={dayBoardDate}
              onChangeIso={(d) => {
                setDayBoardDate(d);
                void loadDayBoard(d);
              }}
            />
            <div className="hub-dayboard__toggle" role="group" aria-label="Agrupar por">
              <button
                type="button"
                className={`hub-dayboard__toggle-btn${dayBoardGroupBy === 'tutor' ? ' hub-dayboard__toggle-btn--active' : ''}`}
                onClick={() => setDayBoardGroupBy('tutor')}
              >
                Tutor
              </button>
              <button
                type="button"
                className={`hub-dayboard__toggle-btn${dayBoardGroupBy === 'pet' ? ' hub-dayboard__toggle-btn--active' : ''}`}
                onClick={() => setDayBoardGroupBy('pet')}
              >
                Pet
              </button>
            </div>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              disabled={dayBoardBusy}
              onClick={() => void loadDayBoard()}
            >
              {dayBoardBusy ? 'Atualizando…' : 'Atualizar'}
            </button>
          </div>

          {/* Chips de filtro de status */}
          <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por status">
            {([
              { id: 'all', label: 'Tudo' },
              { id: 'sem_comanda', label: 'Sem comanda' },
              { id: 'comanda_aberta', label: 'Comanda aberta' },
              { id: 'a_receber', label: 'A receber' },
              { id: 'recebido', label: 'Recebido' },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`hub-dayboard__toggle-btn${atendimentosStatusFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
                onClick={() => setAtendimentosStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading || dayBoardBusy ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : dayBoardGroups.length === 0 && openComandas.length === 0 ? (
            <div className="hub-dayboard__empty">
              Nenhum atendimento encontrado para esta data nesta unidade.
            </div>
          ) : (
            <>
              {dayBoardGroups
                .map((group) => ({
                  ...group,
                  items: group.items.filter((it) => {
                    if (atendimentosStatusFilter === 'all') return true;
                    if (atendimentosStatusFilter === 'sem_comanda') return !it.billing.comanda_id;
                    if (atendimentosStatusFilter === 'comanda_aberta') return it.billing.comanda_id && it.billing.comanda_status === 'aberta';
                    if (atendimentosStatusFilter === 'a_receber') return it.billing.has_receivable && it.billing.comanda_status !== 'fechada';
                    if (atendimentosStatusFilter === 'recebido') return it.billing.has_receivable && it.billing.comanda_status === 'fechada';
                    return true;
                  }),
                }))
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <DayBoardGroup
                    key={group.key}
                    label={group.label}
                    items={group.items}
                    totalEstimated={group.totalEstimated}
                    canCreateReceivable={canCreateReceivable}
                    canFinancialWrite={canFinancialWrite}
                    onOpenComanda={onOpenComanda}
                    onEditComanda={onEditComanda}
                    onCheckout={onCheckoutFromBoard}
                    onBulkCheckout={group.items.filter((it) => it.billing.comanda_status === 'aberta').length >= 2
                      ? onBulkCheckout
                      : undefined}
                    onWaive={onWaiveFromBoard}
                    busy={dayBoardBusy}
                  />
                ))}

              {/* Comandas abertas de outros dias */}
              {(atendimentosStatusFilter === 'all' || atendimentosStatusFilter === 'comanda_aberta') && openComandas.length > 0 && (() => {
                const today = ymdToday();
                const extraComandas = openComandas.filter((c) => {
                  const openedAt = c.opened_at ? String(c.opened_at).slice(0, 10) : null;
                  return openedAt && openedAt < today;
                });
                if (extraComandas.length === 0) return null;
                return (
                  <div className="hub-dayboard__group" style={{ marginTop: 16 }}>
                    <div className="hub-dayboard__group-header">
                      <span className="hub-dayboard__group-name">Pendentes de dias anteriores</span>
                    </div>
                    <div className="hub-clientes__table-wrap" style={{ marginTop: 8 }}>
                      <table className="hub-clientes__table hub-finance-page__table">
                        <thead>
                          <tr><th>Tutor / Pet</th><th>Origem</th><th className="hub-finance-page__th-num">Valor</th><th>Aberta em</th><th>Ações</th></tr>
                        </thead>
                        <tbody>
                          {extraComandas.map((c) => {
                            const guardian = c.guardian as { full_name?: string } | null;
                            const pet = c.pet as { name?: string } | null;
                            const tutorPet = [guardian?.full_name, pet?.name].filter(Boolean).join(' / ') || '—';
                            return (
                              <tr key={String(c.id)}>
                                <td>{tutorPet}</td>
                                <td><span className="hub-clientes__muted">{String(c.origin_type ?? '—')}</span></td>
                                <td className="hub-finance-page__td-num">{formatBrl(Number(c.total_amount ?? 0))}</td>
                                <td>{c.opened_at ? new Date(String(c.opened_at)).toLocaleString('pt-BR') : '—'}</td>
                                <td>
                                  <div className="hub-dayboard__item-actions">
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
                                        title="Cobrar"
                                        aria-label="Cobrar"
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
                  </div>
                );
              })()}
            </>
          )}
        </section>
      )}

      {/* ── Aba: Sessão do caixa ── */}
      {tab === 'session' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Sessão de caixa</h2>
          {!cashOpen ? (
            <div className="hub-finance-page__card-panel">
              <div className="hub-clientes__field hub-finance-page__field-compact">
                <label className="hub-clientes__label" htmlFor="caixa-open-bal">Saldo inicial (abertura)</label>
                <input id="caixa-open-bal" className="hub-clientes__input" value={openBal} onChange={(e) => setOpenBal(e.target.value)} inputMode="decimal" />
              </div>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void onOpenCash()}>Abrir caixa</button>
            </div>
          ) : (
            <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
              <p className="hub-clientes__muted" style={{ margin: '0 0 12px' }}>Caixa aberto nesta unidade.</p>
              <h3 className="hub-finance-page__subsection-title">Sangria / suprimento</h3>
              <div className="hub-finance-page__expense-toolbar">
                <div className="hub-clientes__field hub-finance-page__field-compact">
                  <span className="hub-clientes__label">Tipo</span>
                  <select className="hub-clientes__select-input" value={movType} onChange={(e) => setMovType(e.target.value as 'withdrawal' | 'deposit')} aria-label="Tipo de movimento">
                    <option value="withdrawal">Sangria (retirada)</option>
                    <option value="deposit">Suprimento (entrada)</option>
                  </select>
                </div>
                <div className="hub-clientes__field hub-finance-page__field-compact">
                  <label className="hub-clientes__label" htmlFor="caixa-mov-amt">Valor</label>
                  <input id="caixa-mov-amt" className="hub-clientes__input" value={movAmount} onChange={(e) => setMovAmount(e.target.value)} inputMode="decimal" />
                </div>
                <div className="hub-clientes__field hub-finance-page__field-grow">
                  <label className="hub-clientes__label" htmlFor="caixa-mov-notes">Notas</label>
                  <input id="caixa-mov-notes" className="hub-clientes__input" value={movNotes} onChange={(e) => setMovNotes(e.target.value)} placeholder="Opcional" />
                </div>
                <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-finance-page__btn-align" onClick={() => void onCashMovement()}>Registrar</button>
              </div>
              <div className="hub-finance-page__close-row">
                <div className="hub-clientes__field hub-finance-page__field-grow">
                  <label className="hub-clientes__label" htmlFor="caixa-close-bal">Saldo informado no fechamento</label>
                  <input id="caixa-close-bal" className="hub-clientes__input" value={closeBal} onChange={(e) => setCloseBal(e.target.value)} placeholder="0,00" inputMode="decimal" />
                </div>
                <button type="button" className="hub-clientes__btn" onClick={onCloseCash}>Fechar caixa</button>
              </div>
              {cashOpen && closeDiffPreview != null ? (
                <p className="hub-clientes__muted" style={{ marginTop: 8 }}>
                  Saldo esperado no fechamento: <strong>{formatBrl(expectedBalance)}</strong> · Prévia de diferença (informado − esperado):{' '}
                  <strong style={{ color: closeDiffPreview >= -0.009 ? '#15803d' : '#b91c1c' }}>{formatBrl(closeDiffPreview)}</strong>
                </p>
              ) : null}
            </div>
          )}
          {cashOpen ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Movimentos da sessão</h3>
              {cashRows.length === 0 ? (
                <p className="hub-clientes__muted">Nenhum dinheiro recebido, sangria ou suprimento nesta sessão.</p>
              ) : (
                <div className="hub-clientes__table-wrap">
                  <table className="hub-clientes__table hub-finance-page__table">
                    <thead>
                      <tr>
                        <th>Tipo</th><th>Data</th><th>Referência</th>
                        <th className="hub-finance-page__th-num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashRows.map((row) => (
                        <tr key={`${row.row_kind}:${row.id}`} onClick={() => setSelectedCashItem(row)}>
                          <td>{row.label}</td>
                          <td>{row.happened_at ? new Date(String(row.happened_at)).toLocaleString('pt-BR') : '—'}</td>
                          <td>{String(row.id).slice(0, 8)}…</td>
                          <td className={`hub-finance-page__td-num ${Number(row.signed_amount) >= 0 ? 'hub-finance-page__td-num--pos' : 'hub-finance-page__td-num--neg'}`}>
                            {formatBrl(Number(row.signed_amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
          {cashOpen && cashSummary?.summary.totals_by_method ? (
            <section className="hub-finance-page__panel-section">
              <h3 className="hub-finance-page__subsection-title">Recebido por método (informativo)</h3>
              <p className="hub-clientes__muted">O <strong>saldo esperado</strong> da gaveta considera apenas <strong>dinheiro</strong>. Pix, cartão e outros métodos são exibidos abaixo somente para conferência.</p>
              <ul className="hub-finance-page__item-list">
                {Object.entries(cashSummary.summary.totals_by_method).map(([method, total]) => (
                  <li key={method} className="hub-finance-page__item-list-row">
                    <span>{METHOD_LABELS[method] ?? method}</span>
                    <strong>{formatBrl(Number(total))}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}

      {/* ── Aba: Ajustes por cancelamento ── */}
      {tab === 'cancellation' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Ajustes por cancelamento</h2>
          <p className="hub-clientes__muted" style={{ marginTop: 0 }}>Operação cancelada na agenda ou no atendimento, com pagamento já registrado na comanda. Resolva aqui (reembolso, crédito ou manter cobrança).</p>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : cancellationQueue.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma pendência de cancelamento nesta unidade.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr>
                    <th>Tutor / Pet</th><th>Origem</th>
                    <th className="hub-finance-page__th-num">Pago</th>
                    <th>Cancelamento</th>
                    <th className="hub-clientes__th-actions">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {cancellationQueue.map((c) => {
                    const gu = c.guardian as { full_name?: string } | null | undefined;
                    const pet = c.pet as { name?: string } | null | undefined;
                    const cancelledAt = c.cancellation_operational_at ? new Date(String(c.cancellation_operational_at)).toLocaleString('pt-BR') : '—';
                    return (
                      <tr key={String(c.id)}>
                        <td>{gu?.full_name ?? '—'}{pet?.name ? ` · ${pet.name}` : ''}</td>
                        <td><span className="hub-clientes__muted">{String(c.cancellation_operational_type ?? c.origin_type ?? '—')}</span></td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(c.paid_total ?? 0))}</td>
                        <td>{cancelledAt}</td>
                        <td className="hub-clientes__td-actions">
                          {canFinancialWrite ? (
                            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm" onClick={() => setResolveComanda(c)}>Resolver</button>
                          ) : (
                            <span className="hub-clientes__muted">Sem permissão</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Aba: Sessões fechadas ── */}
      {tab === 'historico' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Últimas sessões fechadas</h2>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : closedSessions.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma sessão fechada encontrada.</p>
          ) : (
            <div className="hub-clientes__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr><th>Abertura</th><th>Fechamento</th><th className="hub-finance-page__th-num">Informado</th><th className="hub-finance-page__th-num">Esperado</th><th className="hub-finance-page__th-num">Diferença</th></tr>
                </thead>
                <tbody>
                  {closedSessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.opened_at ? new Date(s.opened_at).toLocaleString('pt-BR') : '—'}</td>
                      <td>{s.closed_at ? new Date(s.closed_at).toLocaleString('pt-BR') : '—'}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.closing_balance ?? 0))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.expected_balance ?? 0))}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(Number(s.difference_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* ── Aba: Estornos ── */}
      {tab === 'reversal' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Estorno de pagamento</h2>
          {cashOpen && cashSummary?.payments?.length ? (
            <div className="hub-finance-page__panel-section" style={{ marginBottom: 20 }}>
              <h3 className="hub-finance-page__subsection-title">Recebimentos em dinheiro (sessão aberta)</h3>
              <div className="hub-clientes__table-wrap">
                <table className="hub-clientes__table hub-finance-page__table">
                  <thead><tr><th>Data</th><th className="hub-finance-page__th-num">Valor</th><th className="hub-clientes__th-actions">Ação</th></tr></thead>
                  <tbody>
                    {(cashSummary.payments ?? []).map((p) => (
                      <tr key={p.id}>
                        <td>{p.payment_date ? new Date(p.payment_date).toLocaleString('pt-BR') : '—'}</td>
                        <td className="hub-finance-page__td-num">{formatBrl(Number(p.amount ?? 0))}</td>
                        <td className="hub-clientes__td-actions">
                          <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => { setReverseTargetId(p.id); setReverseReason(''); }}>Estornar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>Ou informe manualmente o UUID do pagamento (ex.: cópia do financeiro).</p>
          <div className="hub-finance-page__card-panel hub-finance-page__card-panel--stack">
            {reverseTargetId ? (
              <p className="hub-clientes__muted">
                Estornando pagamento <strong>{reverseTargetId.slice(0, 8)}…</strong>
                <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" style={{ marginLeft: 8 }} onClick={() => setReverseTargetId(null)}>Trocar</button>
              </p>
            ) : (
              <div className="hub-clientes__field hub-finance-page__field-grow">
                <label className="hub-clientes__label" htmlFor="caixa-reverse-payment">ID do pagamento</label>
                <input id="caixa-reverse-payment" className="hub-clientes__input" value={reversePaymentId} onChange={(e) => setReversePaymentId(e.target.value)} placeholder="UUID do hub_payments" />
              </div>
            )}
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="caixa-reverse-reason">Motivo do estorno</label>
              <textarea id="caixa-reverse-reason" className="hub-clientes__input" rows={2} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Descreva o motivo (mín. 3 caracteres)" />
            </div>
            <div>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" disabled={!reverseReason.trim() || reverseReason.trim().length < 3} onClick={() => void onReverseConfirm()}>Confirmar estorno</button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Aba: Pendentes de cobrança ── */}
      {tab === 'pending' ? (
        <section className="hub-finance-page__section">
          <h2 className="hub-clientes__form-title">Pendentes de cobrança</h2>
          {loading ? (
            <p className="hub-clientes__muted">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="hub-clientes__muted">Nenhum atendimento concluído aguardando cobrança nesta unidade.</p>
          ) : (
            <div className="hub-servicos__table-wrap">
              <table className="hub-clientes__table hub-finance-page__table">
                <thead>
                  <tr><th>Origem</th><th>Cliente</th><th>Pet</th><th>Data</th><th className="hub-finance-page__th-num">Valor est.</th><th className="hub-clientes__th-actions">Ações</th></tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={`${row.source_type}:${row.source_id}`}>
                      <td>{row.origin_label}</td>
                      <td>{row.guardian?.full_name ?? '—'}</td>
                      <td>{row.pet?.name ?? '—'}</td>
                      <td>{row.completed_at ? new Date(row.completed_at).toLocaleString('pt-BR') : '—'}</td>
                      <td className="hub-finance-page__td-num">{formatBrl(row.estimated_amount)}</td>
                      <td className="hub-clientes__td-actions">
                        <div className="hub-clientes__td-actions-inner">
                          <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void onGerarCobranca(row)}>Gerar cobrança</button>
                          <button type="button" className="hub-servicos__btn-ghost-sm" onClick={() => void onWaive(row)}>Sem cobrança</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>,
    <>
      <ComandaCancellationResolveDrawer
        open={!!resolveComanda}
        onClose={() => setResolveComanda(null)}
        clinicId={clinicId}
        unitId={unitId}
        comanda={resolveComanda}
        onResolved={() => void load()}
      />

      {clinicId && checkoutComandaId && unitId ? (
        <ComandaCheckoutDrawer
          key={checkoutComandaId}
          open={!!checkoutComandaId}
          onClose={() => setCheckoutComandaId(null)}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={checkoutComandaId}
          onSuccess={() => {
            showSuccess('Cobrança concluída.');
            setCheckoutComandaId(null);
            void load();
            void loadDayBoard();
          }}
        />
      ) : null}

      {selectedCashItem ? (
        <aside className="hub-clientes__panel hub-finance-page__panel" aria-label="Detalhe do movimento de caixa">
          <div className="hub-clientes__panel-scroll">
            <div className="hub-clientes__panel-header">
              <div>
                <h2 className="hub-clientes__panel-title">{String(selectedCashItem.label ?? 'Movimento')}</h2>
                <p className="hub-clientes__muted">#{String(selectedCashItem.id ?? '').slice(0, 8)}</p>
              </div>
              <button type="button" className="hub-clientes__panel-close" aria-label="Fechar detalhe do movimento" onClick={() => setSelectedCashItem(null)}>
                <X size={18} strokeWidth={2} />
              </button>
            </div>
            <div className="hub-finance-page__detail-hero">
              <strong>{formatBrl(Number(selectedCashItem.signed_amount ?? selectedCashItem.amount ?? 0))}</strong>
              <span className="hub-clientes__muted">
                {selectedCashItem.happened_at ? new Date(String(selectedCashItem.happened_at)).toLocaleString('pt-BR') : '—'}
              </span>
            </div>
            <section className="hub-finance-page__panel-section">
              <div className="hub-finance-page__detail-list">
                <p><strong>Tipo:</strong> {String(selectedCashItem.label ?? '—')}</p>
                <p><strong>Origem:</strong> {selectedCashItem.row_kind === 'payment' ? 'Financeiro' : 'Movimento manual do caixa'}</p>
                <p><strong>Observações:</strong> {String(selectedCashItem.notes ?? '—')}</p>
              </div>
            </section>
          </div>
        </aside>
      ) : null}
    </>,
  );
};

export default HubCaixaPage;
