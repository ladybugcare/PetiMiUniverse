import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Coins,
  Lock,
  Pencil,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { useAlert } from '../../components/AlertProvider';
import {
  hubFinancialApi,
  type HubFinanceDayBoardItem,
  type HubCashSession,
  type HubCashSessionSummary,
} from '../../api/hubFinancialApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { CaixaMetricsRow } from './CaixaMetricsRow';
import { canCaixaEditOpenComanda } from './hubComandaEditUtils';
import { FinanceDayBoardTable } from './FinanceDayBoardTable';
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

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

const HubCaixaPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cashOpen, setCashOpen] = useState<HubCashSession | null>(null);
  const [cashSummary, setCashSummary] = useState<HubCashSessionSummary | null>(null);
  const [openBal, setOpenBal] = useState('0');
  const [closeBal, setCloseBal] = useState('');
  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movAmount, setMovAmount] = useState('');
  const [movNotes, setMovNotes] = useState('');
  const [selectedCashItem, setSelectedCashItem] = useState<Record<string, unknown> | null>(null);
  const [openComandas, setOpenComandas] = useState<Array<Record<string, unknown>>>([]);

  // Day board
  const [dayBoardItems, setDayBoardItems] = useState<HubFinanceDayBoardItem[]>([]);
  const [dayBoardDate, setDayBoardDate] = useState(() => ymdToday());
  const [dayBoardBusy, setDayBoardBusy] = useState(false);
  const [atendimentosStatusFilter, setAtendimentosStatusFilter] = useState<'all' | 'sem_comanda' | 'comanda_aberta' | 'a_receber' | 'recebido'>('all');
  const [dayBoardSearch, setDayBoardSearch] = useState('');

  // Drawers
  const [checkoutComandaId, setCheckoutComandaId] = useState<string | null>(null);

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
      const [c, cash, comandasRes, dayBoard] = await Promise.all([
        hubFinancialApi.getPendingBillingCount(clinicId, unitId),
        hubFinancialApi.getCashSessionOpen(clinicId, unitId),
        hubComandaApi.listComandas({ clinic_id: clinicId, unit_id: unitId, status: 'aberta', enrich: true }).catch(() => ({ comandas: [] })),
        hubFinancialApi.getDayBoard(clinicId, unitId, dayBoardDate).catch(() => [] as HubFinanceDayBoardItem[]),
      ]);
      setPending(c);
      setOpenComandas(comandasRes.comandas ?? []);
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

  const onSendToFinanceiro = async (item: HubFinanceDayBoardItem) => {
    if (!canCreateReceivable) { showError('Sem permissão para enviar ao financeiro.'); return; }
    setDayBoardBusy(true);
    try {
      let comandaId = item.billing.comanda_id;
      if (!comandaId) {
        const detail = await hubComandaApi.openComanda({
          clinic_id: clinicId,
          origin_type: item.origin_type as 'appointment' | 'grooming_session' | 'encounter' | 'boarding_reservation',
          origin_id: item.origin_id,
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
      await loadDayBoard();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao enviar ao financeiro');
    } finally {
      setDayBoardBusy(false);
    }
  };

  const dayBoardFiltered = useMemo(() => {
    const searchTerm = normalizeText(dayBoardSearch.trim());
    let result = searchTerm
      ? dayBoardItems.filter((item) => {
          const guardian = normalizeText(item.guardian?.full_name ?? '');
          const pet = normalizeText(item.pet?.name ?? '');
          const svcNames = normalizeText((item.services ?? []).map((s) => s.name).join(' '));
          const label = normalizeText(item.origin_label ?? '');
          return guardian.includes(searchTerm) || pet.includes(searchTerm) || svcNames.includes(searchTerm) || label.includes(searchTerm);
        })
      : dayBoardItems;

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

  const enviarComandasAbertas = async (): Promise<boolean> => {
    const today = ymdToday();
    const abertas = openComandas.filter((c) => c.status === 'aberta' && canCaixaEditOpenComanda(c));
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
    if (Number.isNaN(v) || v < 0) { showError('Saldo de fechamento inválido.'); return; }
    const abertas = openComandas.filter((c) => c.status === 'aberta' && canCaixaEditOpenComanda(c));
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
      showSuccess(movType === 'withdrawal' ? 'Sangria registrada.' : 'Suprimento registrado.');
      setMovAmount('');
      setMovNotes('');
      await load();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar movimento');
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
    const sessionPayments = cashSummary?.all_payments ?? cashSummary?.payments ?? [];
    const payments = sessionPayments.map((payment) => {
      const method = String(payment.payment_method ?? 'cash');
      const methodLabel = METHOD_LABELS[method] ?? method;
      return {
        ...payment,
        row_kind: 'payment' as const,
        label: method === 'cash' ? 'Recebimento em dinheiro' : `Recebimento (${methodLabel})`,
        signed_amount: Number(payment.amount ?? 0),
        happened_at: payment.payment_date,
      };
    });
    const movements = (cashSummary?.movements ?? []).map((movement) => ({
      ...movement,
      row_kind: 'movement' as const,
      label: movement.movement_type === 'deposit' ? 'Suprimento' : 'Sangria',
      signed_amount: movement.movement_type === 'deposit' ? Number(movement.amount ?? 0) : -Number(movement.amount ?? 0),
      happened_at: movement.created_at,
    }));
    return [...payments, ...movements].sort((a, b) => String(b.happened_at).localeCompare(String(a.happened_at)));
  }, [cashSummary]);

  const methodsEntries = useMemo(() => {
    const totals = cashSummary?.summary.totals_by_method;
    if (!totals) return [];
    return Object.entries(totals).filter(([, total]) => Number(total) !== 0);
  }, [cashSummary]);

  const methodsTotal = useMemo(
    () => methodsEntries.reduce((sum, [, total]) => sum + Number(total), 0),
    [methodsEntries],
  );

  const diffDisplay = closeDiffPreview;

  return shell(
    <>
      {isPreviousDaySession && (
        <div className="hub-finance-page__context-warning" role="alert">
          <AlertCircle size={16} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Há uma sessão de caixa aberta de um dia anterior. Feche-a e abra uma nova sessão para o dia de hoje.
        </div>
      )}

      <CaixaMetricsRow
        loading={loading}
        pending={pending}
        cashOpen={!!cashOpen}
        cashOpenedAt={cashOpen?.opened_at}
        cashPaymentsTotal={cashSummary?.summary.cash_payments_total ?? 0}
        expectedBalance={expectedBalance}
        dayBoardCount={dayBoardItems.length}
      />

      {/* ── Três colunas: O caixa | Recebimentos | Histórico ── */}
      <div className="hub-caixa-page__ops-row">
        {/* Coluna 1 — O caixa */}
        <div className="hub-caixa-page__col">
          {!cashOpen ? (
            <div className="hub-caixa-page__card hub-caixa-page__open-card">
              <h3 className="hub-caixa-page__card-title">O caixa</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="caixa-open-bal">Saldo inicial (abertura)</label>
                <div className="hub-caixa-page__money-field">
                  <span className="hub-caixa-page__money-prefix">R$</span>
                  <input
                    id="caixa-open-bal"
                    className="hub-clientes__input"
                    value={openBal}
                    onChange={(e) => setOpenBal(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => void onOpenCash()}>
                Abrir caixa
              </button>
            </div>
          ) : (
            <>
              <div className="hub-caixa-page__card">
                <h3 className="hub-caixa-page__card-title">
                  Sangria / Suprimento
                  <span
                    className="hub-caixa-page__card-title-help"
                    title="Sangria: retirada de dinheiro da gaveta. Suprimento: entrada de dinheiro na gaveta."
                  >
                    <HelpCircle size={15} strokeWidth={2} />
                  </span>
                </h3>
                <div className="hub-caixa-page__form-row">
                  <div className="hub-clientes__field">
                    <span className="hub-clientes__label">Tipo</span>
                    <select
                      className="hub-clientes__select-input"
                      value={movType}
                      onChange={(e) => setMovType(e.target.value as 'withdrawal' | 'deposit')}
                      aria-label="Tipo de movimento"
                    >
                      <option value="withdrawal">Sangria (retirada)</option>
                      <option value="deposit">Suprimento (entrada)</option>
                    </select>
                  </div>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="caixa-mov-amt">Valor</label>
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
                    <label className="hub-clientes__label" htmlFor="caixa-mov-notes">Observação (opcional)</label>
                    <input
                      id="caixa-mov-notes"
                      className="hub-clientes__input"
                      value={movNotes}
                      onChange={(e) => setMovNotes(e.target.value)}
                      placeholder="Ex.: Pagamento de fornecedor"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-caixa-page__btn-register"
                  onClick={() => void onCashMovement()}
                >
                  Registrar
                </button>
              </div>

              <div className="hub-caixa-page__card">
                <h3 className="hub-caixa-page__card-title">Fechamento do caixa</h3>
                <div className="hub-caixa-page__kv-row">
                  <span>Saldo esperado</span>
                  <strong>{formatBrl(expectedBalance)}</strong>
                </div>
                <div className="hub-caixa-page__kv-row">
                  <span>Saldo informado</span>
                  <div className="hub-caixa-page__money-field" style={{ maxWidth: 140 }}>
                    <span className="hub-caixa-page__money-prefix">R$</span>
                    <input
                      id="caixa-close-bal"
                      className="hub-clientes__input"
                      value={closeBal}
                      onChange={(e) => setCloseBal(e.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                      aria-label="Saldo informado no fechamento"
                    />
                  </div>
                </div>
                <div className="hub-caixa-page__kv-row hub-caixa-page__kv-row--divider">
                  <span>Diferença</span>
                  <strong
                    className={
                      diffDisplay == null
                        ? undefined
                        : diffDisplay >= -0.009
                          ? 'hub-caixa-page__kv-diff--pos'
                          : 'hub-caixa-page__kv-diff--neg'
                    }
                  >
                    {diffDisplay != null ? formatBrl(diffDisplay) : '—'}
                  </strong>
                </div>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-caixa-page__btn-close"
                  onClick={onCloseCash}
                >
                  <Lock size={16} strokeWidth={2} />
                  Fechar caixa
                </button>
              </div>
            </>
          )}
        </div>

        {/* Coluna 2 — Recebimentos por Método */}
        <div className="hub-caixa-page__col">
          <div className="hub-caixa-page__card">
            <h3 className="hub-caixa-page__card-title">Recebimentos por Método</h3>
            {!cashOpen ? (
              <p className="hub-caixa-page__empty">Abra o caixa para ver os recebimentos da sessão.</p>
            ) : methodsEntries.length === 0 ? (
              <p className="hub-caixa-page__empty">Nenhum recebimento registrado nesta sessão.</p>
            ) : (
              <>
                <ul className="hub-caixa-page__methods-list">
                  {methodsEntries.map(([method, total]) => (
                    <li key={method} className="hub-caixa-page__methods-row">
                      <span>{METHOD_LABELS[method] ?? method}</span>
                      <strong>{formatBrl(Number(total))}</strong>
                    </li>
                  ))}
                  <li className="hub-caixa-page__methods-row hub-caixa-page__methods-total">
                    <span>Total</span>
                    <strong>{formatBrl(methodsTotal)}</strong>
                  </li>
                </ul>
                <p className="hub-caixa-page__methods-note">
                  O saldo da gaveta considera apenas dinheiro; demais métodos são informativos.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Coluna 3 — Histórico da sessão */}
        <div className="hub-caixa-page__col">
          <div className="hub-caixa-page__card">
            <h3 className="hub-caixa-page__card-title">Histórico da sessão</h3>
            {!cashOpen ? (
              <p className="hub-caixa-page__empty">Abra o caixa para ver o histórico de movimentos.</p>
            ) : cashRows.length === 0 ? (
              <p className="hub-caixa-page__empty">Nenhum movimento nesta sessão.</p>
            ) : (
              <div className="hub-caixa-page__history-scroll">
                <div className="hub-clientes__table-wrap">
                  <table className="hub-clientes__table hub-finance-page__table hub-caixa-page__history-table">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Data</th>
                        <th className="hub-finance-page__th-num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashRows.map((row) => (
                        <tr key={`${row.row_kind}:${row.id}`} onClick={() => setSelectedCashItem(row)}>
                          <td>{row.label}</td>
                          <td>{row.happened_at ? new Date(String(row.happened_at)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className={`hub-finance-page__td-num ${Number(row.signed_amount) >= 0 ? 'hub-finance-page__td-num--pos' : 'hub-finance-page__td-num--neg'}`}>
                            {formatBrl(Number(row.signed_amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ações pendentes do caixa ── */}
      <section className="hub-finance-page__section">
        <h2 className="hub-clientes__form-title">Ações pendentes do caixa</h2>
        <div className="hub-dayboard__toolbar">
          <div className="hub-dayboard__date-nav">
            <button
              type="button"
              className="hub-dayboard__nav-btn"
              aria-label="Dia anterior"
              disabled={dayBoardBusy}
              onClick={() => {
                const prev = addDays(dayBoardDate, -1);
                setDayBoardDate(prev);
                void loadDayBoard(prev);
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <HubDateField
              id="dayboard-date"
              label="Data"
              valueIso={dayBoardDate}
              onChangeIso={(d) => {
                setDayBoardDate(d);
                void loadDayBoard(d);
              }}
            />
            <button
              type="button"
              className="hub-dayboard__nav-btn"
              aria-label="Próximo dia"
              disabled={dayBoardBusy}
              onClick={() => {
                const next = addDays(dayBoardDate, 1);
                setDayBoardDate(next);
                void loadDayBoard(next);
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
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
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={dayBoardBusy}
            onClick={() => void loadDayBoard()}
          >
            {dayBoardBusy ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        <div className="hub-dayboard__status-filters" role="group" aria-label="Filtrar por status">
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
              className={`hub-dayboard__toggle-btn${atendimentosStatusFilter === f.id ? ' hub-dayboard__toggle-btn--active' : ''}`}
              onClick={() => setAtendimentosStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading || dayBoardBusy ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : dayBoardFiltered.length === 0 && openComandas.length === 0 ? (
          <div className="hub-dayboard__empty">
            Nenhuma ação pendente encontrada para esta data nesta unidade.
          </div>
        ) : (
          <>
            {dayBoardFiltered.length > 0 && (
              <FinanceDayBoardTable
                mode="caixa"
                items={dayBoardFiltered}
                canCreateReceivable={canCreateReceivable}
                canFinancialWrite={canFinancialWrite}
                onOpenComanda={onOpenComanda}
                onEditComanda={onEditComanda}
                onViewComanda={onViewComanda}
                onCheckout={onCheckoutFromBoard}
                onSendToFinanceiro={onSendToFinanceiro}
                onWaive={onWaiveFromBoard}
                onShareComanda={onShareComanda}
                busy={dayBoardBusy}
              />
            )}

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
                                  {canCreateReceivable && canCaixaEditOpenComanda(c) && (
                                    <button
                                      type="button"
                                      className="hub-dayboard__action-btn"
                                      title="Editar comanda"
                                      aria-label="Editar comanda"
                                      onClick={() => {
                                        if (c.finance_handoff_at) {
                                          navigate(`/hub/financeiro/comanda/${String(c.id)}`);
                                        } else {
                                          navigate(`/hub/caixa/comanda/${String(c.id)}`);
                                        }
                                      }}
                                    >
                                      <Pencil size={15} strokeWidth={2} />
                                    </button>
                                  )}
                                  {canCreateReceivable && canCaixaEditOpenComanda(c) && (
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
                                  {canCreateReceivable && !canCaixaEditOpenComanda(c) && (
                                    <button
                                      type="button"
                                      className="hub-dayboard__action-btn"
                                      title="Ver comanda"
                                      aria-label="Ver comanda"
                                      onClick={() => navigate(`/hub/caixa/comanda/${String(c.id)}`)}
                                    >
                                      <Receipt size={15} strokeWidth={2} />
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
    </>,
    <>
      {clinicId && checkoutComandaId && unitId ? (
        <ComandaCheckoutDrawer
          key={checkoutComandaId}
          open={!!checkoutComandaId}
          onClose={() => setCheckoutComandaId(null)}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={checkoutComandaId}
          onSuccess={({ comandaId, kind, receivableIds }) => {
            showSuccess(kind === 'leave_pending' ? 'Comanda enviada ao financeiro.' : 'Cobrança concluída.');
            setCheckoutComandaId(null);
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
