import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  openHubPaymentReceiptPdf,
  type HubFinancePayment,
  type HubFinanceReceivableDetail,
  type HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import {
  hubInventoryApi,
  type HubInventoryItem,
  type HubInventoryLotRow,
} from '../../api/hubInventoryApi';
import { HubDateField } from '../../components/HubDateField';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import {
  emptyCardMachineFees,
  normalizeCardMachineFees,
  type CardMachineFees,
} from '../../utils/hubCardMachineFees';
import {
  defaultPaymentMethod,
  filterEnabledPaymentMethods,
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';
import {
  CheckoutDrawerActionTabs,
  CheckoutDrawerBillingShell,
  CheckoutDrawerCancelReasonField,
  CheckoutDrawerHero,
  CheckoutDrawerSection,
  CheckoutDrawerSummaryCell,
  CheckoutDrawerSummaryGrid,
  type CheckoutDrawerBillingAction,
} from './checkoutDrawerParts';
import {
  CheckoutPaymentLinesEditor,
  createDefaultPaymentLine,
  parseAmount,
  sumPaymentLines,
  totalChangeDue,
  type CheckoutPaymentLine,
} from './CheckoutPaymentLinesEditor';
import {
  assumedMerchandiseReturnValue,
  emptyMerchandiseReturnValue,
  HubMerchandiseReturnSection,
  merchandiseLinesFromReceivableDetail,
  merchandiseReturnApiFields,
  selectedMerchandiseAmount,
  type MerchandiseReturnValue,
} from './HubMerchandiseReturnSection';
import { formatComandaOriginLabel } from './comandaListPreview';
import { HubPaymentReversalForm, type PaymentReversalMode } from './HubPaymentReversalForm';
import {
  HubReceivableCancelIntentField,
  type ReceivableCancelIntent,
} from './HubReceivableCancelIntentField';
import { ReceivableStockReturnBadge } from './ReceivableStockReturnBadge';

const FINANCE_ESTORNOS_HREF = '/hub/financeiro?tab=adjustments&adjust=reversals';

const STANDALONE_REFUND_METHOD_OPTIONS_BASE: HubComboboxOption[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'other', label: 'Outro' },
];

function standaloneRefundMethodOptions(hasGuardian: boolean): HubComboboxOption[] {
  if (!hasGuardian) return STANDALONE_REFUND_METHOD_OPTIONS_BASE;
  return [
    STANDALONE_REFUND_METHOD_OPTIONS_BASE[0],
    STANDALONE_REFUND_METHOD_OPTIONS_BASE[1],
    STANDALONE_REFUND_METHOD_OPTIONS_BASE[2],
    { value: 'customer_credit', label: 'Crédito do tutor' },
    ...STANDALONE_REFUND_METHOD_OPTIONS_BASE.slice(3),
  ];
}

function isPostedPayment(payment: HubFinancePayment): boolean {
  return String(payment.status ?? 'posted') !== 'reversed';
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

const LINE_KIND_LABELS: Record<string, string> = {
  quote_line: 'Serviço (orçamento)',
  appointment_service: 'Serviço (agenda)',
  grooming_extra: 'Extra (banho/tosa)',
  manual: 'Manual',
  product: 'Produto (estoque)',
};

function statusLabel(status: string): string {
  return RECEIVABLE_STATUS_LABELS[status] ?? status;
}

function statusPillClass(status: string): string {
  if (status === 'paid') return 'hub-clientes__pill hub-clientes__pill--active';
  if (status === 'cancelled' || status === 'refunded') return 'hub-clientes__pill hub-clientes__pill--inactive-alert';
  if (status === 'partially_paid') return 'hub-clientes__pill hub-finance-page__pill--warning';
  return 'hub-clientes__pill hub-clientes__pill--inactive';
}

export type ReceivablePaymentControls = {
  action: CheckoutDrawerBillingAction;
  canSubmit: boolean;
  loading: boolean;
  submit: () => void;
};

export type HubComandaReceivablePanelProps = {
  comandaId: string;
  receivableIds: string[];
  selectedReceivableId: string;
  onSelectReceivable: (id: string) => void;
  onRefreshComanda?: () => void;
  onCancelSuccess?: () => void;
  highlightPayment?: boolean;
  hideHeader?: boolean;
  onPaymentControlsChange?: (controls: ReceivablePaymentControls | null) => void;
};

export const HubComandaReceivablePanel: React.FC<HubComandaReceivablePanelProps> = ({
  comandaId,
  receivableIds,
  selectedReceivableId,
  onSelectReceivable,
  onRefreshComanda,
  onCancelSuccess,
  highlightPayment = false,
  hideHeader = false,
  onPaymentControlsChange,
}) => {
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();
  const { hasPermission } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();

  const [detail, setDetail] = useState<HubFinanceReceivableDetail | null>(null);
  const [paymentLines, setPaymentLines] = useState<CheckoutPaymentLine[]>([]);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<HubPaymentMethod[]>([]);
  const [cardMachineFees, setCardMachineFees] = useState<CardMachineFees>(emptyCardMachineFees);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const paymentIdempotencyKeysRef = useRef<Record<string, string>>({});
  const [billingAction, setBillingAction] = useState<CheckoutDrawerBillingAction>('receive_now');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelIntent, setCancelIntent] = useState<ReceivableCancelIntent>('void_sale');
  const [cancelMerchandiseReturn, setCancelMerchandiseReturn] = useState<MerchandiseReturnValue>(() =>
    emptyMerchandiseReturnValue(),
  );
  const [standaloneReturnOpen, setStandaloneReturnOpen] = useState(false);
  const [standaloneReturnReason, setStandaloneReturnReason] = useState('');
  const [standaloneMerchandiseReturn, setStandaloneMerchandiseReturn] = useState<MerchandiseReturnValue>(
    () => emptyMerchandiseReturnValue(),
  );
  const standaloneReturnIdemKeyRef = useRef<string | null>(null);
  const ensureStandaloneReturnIdemKey = useCallback(() => {
    if (standaloneReturnIdemKeyRef.current) return standaloneReturnIdemKeyRef.current;
    const key =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36);
    standaloneReturnIdemKeyRef.current = key;
    return key;
  }, []);

  const [standaloneRefundMethod, setStandaloneRefundMethod] = useState('pix');
  const [standaloneRefundDate, setStandaloneRefundDate] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  });
  /** Após marcar devolução com pagamento ainda posted e sem permissão de estorno. */
  const [standaloneNeedFinanceHandoff, setStandaloneNeedFinanceHandoff] = useState(false);
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [reverseQueue, setReverseQueue] = useState<string[]>([]);
  const [reverseInitialMode, setReverseInitialMode] = useState<PaymentReversalMode>('payment_reversal');
  const [reverseInitialReason, setReverseInitialReason] = useState('');
  const [reversePrefillMerch, setReversePrefillMerch] = useState<MerchandiseReturnValue | null>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [historicalAmount, setHistoricalAmount] = useState('');
  const [historicalDate, setHistoricalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historicalReason, setHistoricalReason] = useState('');
  const [lineServiceTypes, setLineServiceTypes] = useState<HubServiceType[]>([]);
  const [comandaPetNames, setComandaPetNames] = useState<string[]>([]);
  const [showHighlight, setShowHighlight] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addProductLoading, setAddProductLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [addProductItemId, setAddProductItemId] = useState('');
  const [addProductLotId, setAddProductLotId] = useState('');
  const [addProductQty, setAddProductQty] = useState('1');
  const [addProductUnitAmount, setAddProductUnitAmount] = useState('');

  const activeReceivableId = selectedReceivableId || receivableIds[0] || '';
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(activeReceivableId || null, false);
  const drawerLayout = hideHeader;

  const loadDetail = useCallback(async () => {
    if (!clinicId || !activeReceivableId) {
      setDetail(null);
      return;
    }
    begin();
    try {
      const d = await hubFinancialApi.getReceivableDetail(activeReceivableId, clinicId);
      setDetail(d);
      succeed();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar recebível');
      setDetail(null);
    } finally {
      finish();
    }
  }, [activeReceivableId, clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    setShowAddProduct(false);
    setAddProductItemId('');
    setAddProductLotId('');
  }, [activeReceivableId]);

  useEffect(() => {
    if (!clinicId || !unitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { cash_session } = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        if (!cancelled) setCashSessionId(cash_session?.id ?? null);
      } catch {
        if (!cancelled) setCashSessionId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, unitId]);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await hubFinancialApi.getPaymentMethodSettings(clinicId);
        const methods = filterEnabledPaymentMethods(res.accepted_payment_methods ?? []);
        if (!cancelled) {
          setAcceptedPaymentMethods(methods);
          setCardMachineFees(normalizeCardMachineFees(res.card_machine_fees));
        }
      } catch {
        if (!cancelled) {
          setAcceptedPaymentMethods(filterEnabledPaymentMethods([]));
          setCardMachineFees(emptyCardMachineFees());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId) return;
    void (async () => {
      try {
        const types = await hubServiceTypesApi.list(clinicId, false, true);
        setLineServiceTypes(types.service_types ?? []);
      } catch {
        setLineServiceTypes([]);
      }
    })();
  }, [clinicId]);

  useEffect(() => {
    if (!clinicId || !comandaId) return;
    let cancelled = false;
    void (async () => {
      try {
        const comandaDetail = await hubComandaApi.getComandaDetail(comandaId, clinicId);
        if (cancelled) return;
        const names = new Set<string>();
        for (const pet of comandaDetail.pets ?? []) {
          if (pet.name?.trim()) names.add(pet.name.trim());
        }
        const embeddedPet = (comandaDetail.comanda as Record<string, unknown>).pet as { name?: string } | null;
        if (embeddedPet?.name?.trim()) names.add(embeddedPet.name.trim());
        setComandaPetNames([...names]);
      } catch {
        if (!cancelled) setComandaPetNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, comandaId]);

  useEffect(() => {
    if (!highlightPayment) return;
    setShowHighlight(true);
    paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = window.setTimeout(() => setShowHighlight(false), 4000);
    return () => window.clearTimeout(timer);
  }, [highlightPayment, activeReceivableId]);

  const lineServiceTypeById = useMemo(
    () => new Map(lineServiceTypes.map((type) => [type.id, type])),
    [lineServiceTypes],
  );

  const selectedPayments = detail?.payments ?? [];
  const selectedPaid = Number(detail?.paid_amount ?? 0);
  const selectedBalance = Number(
    detail?.balance_amount ?? Math.max(0, Number(detail?.final_amount ?? 0) - selectedPaid),
  );

  const petNames = useMemo(() => {
    const names = new Set(comandaPetNames);
    for (const line of detail?.lines ?? []) {
      const name = line.pet?.name?.trim();
      if (name) names.add(name);
    }
    return [...names];
  }, [comandaPetNames, detail?.lines]);

  const canRegisterPayment = Boolean(
    detail &&
      hasPermission('hub.cash.receive') &&
      !['cancelled', 'refunded', 'paid'].includes(detail.status),
  );
  const canAddProductLine = Boolean(
    detail &&
      hasPermission('hub.financial.write') &&
      !['cancelled', 'refunded'].includes(detail.status),
  );
  /** Remoção de linha de produto no recebível exige inventory.write (mesma regra da API). */
  const canRemoveProductLine = Boolean(
    detail &&
      hasPermission('hub.inventory.write') &&
      !['cancelled', 'refunded'].includes(detail.status),
  );
  const canHistoricalCash = Boolean(
    detail &&
      hasPermission('hub.financial.adjust') &&
      !['cancelled', 'refunded', 'paid'].includes(detail.status),
  );

  const canCancelReceivable = Boolean(
    detail && hasPermission('hub.financial.write') && detail.status !== 'cancelled',
  );

  const showBillingActions = drawerLayout && (canRegisterPayment || canCancelReceivable);

  useEffect(() => {
    setBillingAction(canRegisterPayment ? 'receive_now' : 'cancel');
    setCancelReason('');
    paymentIdempotencyKeysRef.current = {};
  }, [activeReceivableId, canRegisterPayment]);

  useEffect(() => {
    if (!canRegisterPayment || !detail) return;
    if (detail.id !== activeReceivableId) return;
    const balance = Number(
      detail.balance_amount ?? Math.max(0, Number(detail.final_amount ?? 0) - Number(detail.paid_amount ?? 0)),
    );
    const method = defaultPaymentMethod(acceptedPaymentMethods);
    setPaymentLines([createDefaultPaymentLine(method, balance > 0.009 ? balance : 0)]);
    paymentIdempotencyKeysRef.current = {};
  }, [activeReceivableId, canRegisterPayment, acceptedPaymentMethods, detail?.id]);

  const lineTypeLabel = useCallback(
    (line: NonNullable<HubFinanceReceivableDetail['lines']>[number]) => {
      if (line.hub_service_type_id) {
        const type = lineServiceTypeById.get(line.hub_service_type_id);
        if (type) return type.name;
      }
      return LINE_KIND_LABELS[line.line_kind] ?? line.line_kind;
    },
    [lineServiceTypeById],
  );

  const onCreatePayment = useCallback(async () => {
    if (!clinicId || !unitId || !detail) return;
    if (!hasPermission('hub.cash.receive')) {
      showError('Sem permissão para registrar pagamentos.');
      return;
    }
    if (!paymentLines.length) {
      showError('Informe ao menos uma forma de pagamento.');
      return;
    }

    const validated: Array<{
      method: HubPaymentMethod;
      amount: number;
      tendered: number | null;
      installments: number;
      lineId: string;
    }> = [];
    for (const line of paymentLines) {
      const amount = parseAmount(line.amountStr);
      if (Number.isNaN(amount) || amount <= 0) {
        showError('Informe valores de pagamento válidos em todas as linhas.');
        return;
      }
      let tendered: number | null = null;
      if (line.method === 'cash' && line.tenderedStr.trim()) {
        tendered = parseAmount(line.tenderedStr);
        if (Number.isNaN(tendered) || tendered <= 0) {
          showError('Valor recebido em dinheiro inválido.');
          return;
        }
        if (amount > tendered + 0.02) {
          showError('O valor do pagamento não pode ser maior que o valor recebido (troco).');
          return;
        }
      }
      const installments =
        line.method === 'credit_card'
          ? Math.max(1, Math.min(99, Math.floor(Number(line.installments) || 1)))
          : 1;
      validated.push({
        method: line.method,
        amount: Math.round(amount * 100) / 100,
        tendered,
        installments,
        lineId: line.id,
      });
    }
    const totalPay = sumPaymentLines(paymentLines);
    if (totalPay > selectedBalance + 0.02) {
      showError(`Valor não pode ser maior que ${formatBrl(selectedBalance)}.`);
      return;
    }

    setPaymentLoading(true);
    try {
      let sessionId: string | null = cashSessionId;
      if (validated.some((l) => l.method === 'cash')) {
        const cash = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        sessionId = cash.cash_session?.id ?? null;
        if (!sessionId) {
          showError('Abra o caixa para receber em dinheiro.');
          return;
        }
        setCashSessionId(sessionId);
      }
      const ensureIdemKey = (lineId: string) => {
        if (!paymentIdempotencyKeysRef.current[lineId]) {
          paymentIdempotencyKeysRef.current[lineId] =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `pay-${Date.now()}-${lineId}`;
        }
        return paymentIdempotencyKeysRef.current[lineId];
      };
      for (const line of validated) {
        await hubFinancialApi.createReceivablePayment(detail.id, {
          clinic_id: clinicId,
          amount: line.amount,
          payment_method: line.method,
          installments: line.installments,
          cash_session_id: line.method === 'cash' ? sessionId : null,
          idempotency_key: ensureIdemKey(line.lineId),
          tendered_amount: line.tendered,
        });
      }
      paymentIdempotencyKeysRef.current = {};
      const change = totalChangeDue(paymentLines);
      showSuccess(
        change > 0.009
          ? `Pagamento registrado. Troco: ${formatBrl(change)}.`
          : 'Pagamento registrado.',
      );
      setPaymentLines([createDefaultPaymentLine(defaultPaymentMethod(acceptedPaymentMethods), 0)]);
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar pagamento');
    } finally {
      setPaymentLoading(false);
    }
  }, [
    clinicId,
    unitId,
    detail,
    hasPermission,
    paymentLines,
    selectedBalance,
    cashSessionId,
    acceptedPaymentMethods,
    showError,
    showSuccess,
    loadDetail,
    onRefreshComanda,
  ]);

  const merchandiseLines = useMemo(
    () => merchandiseLinesFromReceivableDetail(detail),
    [detail],
  );

  const pendingMerchandiseLines = useMemo(
    () => merchandiseLines.filter((l) => !l.alreadyReturned),
    [merchandiseLines],
  );

  const postedPayments = useMemo(
    () => (detail?.payments ?? []).filter(isPostedPayment),
    [detail?.payments],
  );

  const financeReversalDone =
    !detail
      ? false
      : postedPayments.length === 0 &&
        (detail.status === 'refunded' ||
          detail.status === 'cancelled' ||
          (detail.payments ?? []).some((p) => String(p.status) === 'reversed'));

  const resetStandaloneReturn = useCallback(() => {
    setStandaloneReturnOpen(false);
    setStandaloneReturnReason('');
    setStandaloneMerchandiseReturn(emptyMerchandiseReturnValue());
    setStandaloneRefundMethod('pix');
    setStandaloneNeedFinanceHandoff(false);
    standaloneReturnIdemKeyRef.current = null;
  }, []);

  /**
   * Estimativa de reembolso financeiro desta operação.
   * Usa pago líquido efetivo (posted − refunds de linha já liquidados), alinhado à RPC.
   */
  const estimatedFinancialRefund = useMemo(() => {
    if (!detail) return 0;
    const commercial = selectedMerchandiseAmount(merchandiseLines, standaloneMerchandiseReturn);
    if (commercial <= 0) return 0;
    const returnedBefore = Number(detail.returned_amount ?? 0);
    const netAtSale = Number(
      detail.net_amount_at_sale ?? Number(detail.final_amount ?? 0) + returnedBefore,
    );
    const finalAfter = Math.max(0, Math.round((netAtSale - returnedBefore - commercial) * 100) / 100);
    const posted =
      detail.posted_amount != null
        ? Number(detail.posted_amount)
        : postedPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const lineRefundsBefore = Number(detail.line_refunds_amount ?? 0);
    const overpay = Math.max(0, Math.round((posted - finalAfter) * 100) / 100);
    return Math.max(0, Math.round((overpay - lineRefundsBefore) * 100) / 100);
  }, [detail, merchandiseLines, standaloneMerchandiseReturn, postedPayments]);

  useEffect(() => {
    if (detail?.guardian_id || detail?.guardian?.id) return;
    if (standaloneRefundMethod === 'customer_credit') setStandaloneRefundMethod('pix');
  }, [detail?.guardian_id, detail?.guardian?.id, standaloneRefundMethod]);

  const closeReverseForm = useCallback(() => {
    setReversePaymentId(null);
    setReverseQueue([]);
    setReverseInitialMode('payment_reversal');
    setReverseInitialReason('');
    setReversePrefillMerch(null);
  }, []);

  const openReverseForPayment = useCallback(
    (
      paymentId: string,
      opts?: {
        mode?: PaymentReversalMode;
        reason?: string;
        merchandise?: MerchandiseReturnValue | null;
        queue?: string[];
      },
    ) => {
      setStandaloneReturnOpen(false);
      setStandaloneNeedFinanceHandoff(false);
      setReversePaymentId(paymentId);
      setReverseQueue((opts?.queue ?? []).filter((id) => id !== paymentId));
      setReverseInitialMode(opts?.mode ?? 'payment_reversal');
      setReverseInitialReason(opts?.reason ?? '');
      setReversePrefillMerch(opts?.merchandise ?? null);
    },
    [],
  );

  const onReverseFormSuccess = useCallback(() => {
    const [nextId, ...rest] = reverseQueue;
    if (nextId) {
      // Estoque (se marcado) já foi tratado no 1º reembolso — próximos só financeiro.
      setReversePrefillMerch(null);
      setReversePaymentId(nextId);
      setReverseQueue(rest);
      void loadDetail();
      onRefreshComanda?.();
      return;
    }
    closeReverseForm();
    void loadDetail();
    onRefreshComanda?.();
  }, [reverseQueue, closeReverseForm, loadDetail, onRefreshComanda]);

  const onConfirmStandaloneProductReturn = useCallback(async () => {
    if (!clinicId || !detail) return;
    if (pendingMerchandiseLines.length === 0) {
      showError('Não há produtos pendentes de devolução.');
      return;
    }
    if (standaloneReturnReason.trim().length < 3) {
      showError('Informe o motivo da devolução (mín. 3 caracteres).');
      return;
    }
    if (standaloneMerchandiseReturn.selectedLineIds.length === 0) {
      showError('Selecione ao menos um produto para devolver.');
      return;
    }
    if (!standaloneMerchandiseReturn.condition) {
      showError('Selecione se a mercadoria está apta ou não para revenda.');
      return;
    }
    const needsFinancialRefund = estimatedFinancialRefund > 0.009;
    if (needsFinancialRefund && !hasPermission('hub.payments.reverse')) {
      setStandaloneNeedFinanceHandoff(true);
      return;
    }
    if (!needsFinancialRefund && !hasPermission('hub.financial.write')) {
      showError('Sem permissão para registrar devolução de mercadoria.');
      return;
    }
    if (needsFinancialRefund && !standaloneRefundDate) {
      showError('Informe a data efetiva do reembolso.');
      return;
    }
    if (
      needsFinancialRefund &&
      standaloneRefundMethod === 'customer_credit' &&
      !detail.guardian_id &&
      !detail.guardian?.id
    ) {
      showError('Esta cobrança não tem tutor — escolha Pix, dinheiro ou outra forma de reembolso.');
      return;
    }

    const stockFields = merchandiseReturnApiFields(standaloneMerchandiseReturn);
    if (!stockFields.stock_return_lines?.length || !stockFields.stock_return_condition) {
      showError('Selecione os itens e a condição da mercadoria.');
      return;
    }

    setPaymentLoading(true);
    try {
      const res = await hubFinancialApi.confirmReceivableProductReturn(detail.id, {
        clinic_id: clinicId,
        reason: standaloneReturnReason.trim(),
        stock_return_condition: stockFields.stock_return_condition,
        stock_return_lines: stockFields.stock_return_lines,
        refund_method: needsFinancialRefund ? (standaloneRefundMethod as HubPaymentMethod) : null,
        refund_effective_date: needsFinancialRefund ? standaloneRefundDate : null,
        idempotency_key: ensureStandaloneReturnIdemKey(),
      });
      const refundLabel =
        res.refund_amount && res.refund_amount > 0
          ? ` Reembolso financeiro de ${formatBrl(res.refund_amount)}.`
          : '';
      showSuccess(res.warning || `Devolução registrada.${refundLabel}`);
      resetStandaloneReturn();
      if (res.receivable) setDetail(res.receivable);
      else await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao registrar devolução');
    } finally {
      setPaymentLoading(false);
    }
  }, [
    clinicId,
    detail,
    hasPermission,
    pendingMerchandiseLines.length,
    estimatedFinancialRefund,
    standaloneReturnReason,
    standaloneMerchandiseReturn,
    standaloneRefundMethod,
    standaloneRefundDate,
    ensureStandaloneReturnIdemKey,
    showError,
    showSuccess,
    resetStandaloneReturn,
    loadDetail,
    onRefreshComanda,
  ]);

  /** Devolução por item: reembolsa só o valor selecionado (não estorna a comanda inteira). */
  const onAttemptMerchandiseReturn = useCallback(() => {
    if (!detail) return;
    if (standaloneReturnReason.trim().length < 3) {
      showError('Informe o motivo da devolução (mín. 3 caracteres).');
      return;
    }
    if (standaloneMerchandiseReturn.selectedLineIds.length === 0) {
      showError('Selecione ao menos um produto para devolver.');
      return;
    }
    if (!standaloneMerchandiseReturn.condition) {
      showError('Selecione se a mercadoria está apta ou não para revenda.');
      return;
    }
    if (pendingMerchandiseLines.length === 0) {
      showError('Não há produtos pendentes de devolução.');
      return;
    }

    if (estimatedFinancialRefund > 0.009 && !hasPermission('hub.payments.reverse')) {
      setStandaloneNeedFinanceHandoff(true);
      return;
    }

    void onConfirmStandaloneProductReturn();
  }, [
    detail,
    standaloneReturnReason,
    standaloneMerchandiseReturn,
    pendingMerchandiseLines.length,
    estimatedFinancialRefund,
    hasPermission,
    showError,
    onConfirmStandaloneProductReturn,
  ]);

  const onCancelReceivable = useCallback(async () => {
    if (!clinicId || !detail) return;
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para cancelar recebíveis.');
      return;
    }
    if (cancelReason.trim().length < 3) {
      showError('Informe o motivo do cancelamento (mín. 3 caracteres).');
      return;
    }
    const pendingMerchandise = pendingMerchandiseLines.some((l) => !l.alreadyReturned);
    if (
      pendingMerchandise &&
      cancelMerchandiseReturn.returned &&
      cancelMerchandiseReturn.selectedLineIds.length === 0
    ) {
      showError('Selecione ao menos um produto para devolver.');
      return;
    }
    if (pendingMerchandise && cancelMerchandiseReturn.returned && !cancelMerchandiseReturn.condition) {
      showError('Selecione se a mercadoria está apta ou não para revenda.');
      return;
    }
    setPaymentLoading(true);
    try {
      const stockFields = pendingMerchandise ? merchandiseReturnApiFields(cancelMerchandiseReturn) : {};
      const res = await hubFinancialApi.cancelReceivable(detail.id, {
        clinic_id: clinicId,
        reason: cancelReason.trim(),
        intent: cancelIntent,
        ...stockFields,
      });
      const statusNote =
        res.comanda_status === 'cancelada'
          ? ' Comanda cancelada.'
          : res.comanda_status === 'aberta' && cancelIntent === 'reissue_billing'
            ? ' Comanda reaberta para nova cobrança.'
            : '';
      showSuccess((res.warning || 'Recebível cancelado.') + statusNote);
      setCancelReason('');
      setCancelIntent('void_sale');
      setCancelMerchandiseReturn(emptyMerchandiseReturnValue());
      await loadDetail();
      onRefreshComanda?.();
      onCancelSuccess?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    } finally {
      setPaymentLoading(false);
    }
  }, [
    clinicId,
    detail,
    hasPermission,
    cancelReason,
    cancelIntent,
    cancelMerchandiseReturn,
    pendingMerchandiseLines,
    showError,
    showSuccess,
    loadDetail,
    onRefreshComanda,
    onCancelSuccess,
  ]);

  const onConfirmBilling = useCallback(async () => {
    if (billingAction === 'cancel') {
      await onCancelReceivable();
      return;
    }
    await onCreatePayment();
  }, [billingAction, onCancelReceivable, onCreatePayment]);

  useEffect(() => {
    if (!drawerLayout || !onPaymentControlsChange) return;
    const canSubmit = billingAction === 'receive_now' ? canRegisterPayment : canCancelReceivable;
    onPaymentControlsChange({
      action: billingAction,
      canSubmit,
      loading: paymentLoading,
      submit: () => void onConfirmBilling(),
    });
    return () => onPaymentControlsChange(null);
  }, [
    drawerLayout,
    onPaymentControlsChange,
    billingAction,
    canRegisterPayment,
    canCancelReceivable,
    paymentLoading,
    onConfirmBilling,
  ]);

  const onHistoricalCash = useCallback(async () => {
    if (!clinicId || !detail) return;
    if (!canHistoricalCash) {
      showError('Sem permissão para correção histórica.');
      return;
    }
    const amount = Number(String(historicalAmount).replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Informe um valor válido.');
      return;
    }
    if (historicalReason.trim().length < 3) {
      showError('Justificativa obrigatória (mín. 3 caracteres).');
      return;
    }
    setPaymentLoading(true);
    try {
      await hubFinancialApi.createHistoricalCashPayment(detail.id, {
        clinic_id: clinicId,
        amount,
        effective_payment_date: historicalDate,
        reason: historicalReason.trim(),
        idempotency_key:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined,
      });
      showSuccess('Correção histórica registrada.');
      setHistoricalOpen(false);
      setHistoricalAmount('');
      setHistoricalReason('');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro na correção histórica');
    } finally {
      setPaymentLoading(false);
    }
  }, [
    clinicId,
    detail,
    canHistoricalCash,
    historicalAmount,
    historicalDate,
    historicalReason,
    showError,
    showSuccess,
    loadDetail,
    onRefreshComanda,
  ]);

  const onRemoveProductLine = async (lineId: string) => {
    if (!clinicId || !detail) return;
    showConfirm('Remover este produto e devolver ao estoque?', async () => {
      try {
        await hubFinancialApi.removeReceivableProductLine(detail.id, lineId, clinicId);
        showSuccess('Produto removido e estoque ajustado.');
        await loadDetail();
        onRefreshComanda?.();
      } catch (e) {
        showError((e as Error)?.message || 'Erro ao remover produto');
      }
    });
  };

  const openAddProductForm = async () => {
    if (!clinicId) return;
    setShowAddProduct(true);
    setAddProductItemId('');
    setAddProductLotId('');
    setAddProductQty('1');
    setAddProductUnitAmount('');
    try {
      const [invRes, lotsRes] = await Promise.all([
        hubInventoryApi.items.list(clinicId, false, 'product'),
        hubInventoryApi.lots.list(clinicId),
      ]);
      const sellable = (invRes.items ?? []).filter((p) => {
        if (p.deleted_at || p.active === false) return false;
        const purpose = (p.sale_purpose ?? '').trim().toUpperCase();
        return !purpose || purpose === 'SALE';
      });
      setInventoryItems(sellable);
      setInventoryLots(lotsRes.lots ?? []);
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao carregar produtos');
      setShowAddProduct(false);
    }
  };

  const onSelectAddProductItem = (itemId: string) => {
    setAddProductItemId(itemId);
    const inv = inventoryItems.find((p) => p.id === itemId);
    setAddProductUnitAmount(inv ? String(inv.sale_amount ?? 0) : '');
    const lot =
      inventoryLots.find((l) => l.item_id === itemId && Number(l.qty_on_hand ?? 0) > 0) ??
      inventoryLots.find((l) => l.item_id === itemId);
    setAddProductLotId(lot?.id ?? '');
  };

  const onAddProductLine = async () => {
    if (!clinicId || !detail) return;
    const qty = parseAmount(addProductQty);
    const unit = parseAmount(addProductUnitAmount);
    if (!addProductItemId || !addProductLotId) {
      showError('Selecione produto e lote.');
      return;
    }
    if (!(qty > 0)) {
      showError('Informe a quantidade.');
      return;
    }
    setAddProductLoading(true);
    try {
      await hubFinancialApi.addReceivableProductLine(detail.id, {
        clinic_id: clinicId,
        item_id: addProductItemId,
        lot_id: addProductLotId,
        quantity: qty,
        unit_sale_amount: unit,
      });
      showSuccess('Produto adicionado e estoque baixado.');
      setShowAddProduct(false);
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao adicionar produto');
    } finally {
      setAddProductLoading(false);
    }
  };

  const addProductOptions = useMemo(
    () => [
      { value: '', label: '— Selecionar produto —' },
      ...inventoryItems.map((p) => ({
        value: p.id,
        label: `${p.name} · estoque ${Number(p.qty_on_hand ?? 0)}`,
      })),
    ],
    [inventoryItems],
  );

  const addProductLotOptions = useMemo(() => {
    if (!addProductItemId) return [{ value: '', label: '— Lote —' }];
    return [
      { value: '', label: '— Lote —' },
      ...inventoryLots
        .filter((l) => l.item_id === addProductItemId)
        .map((l) => ({
          value: l.id,
          label: `${l.lot_code || 'Sem lote'} · ${Number(l.qty_on_hand ?? 0)}`,
        })),
    ];
  }, [addProductItemId, inventoryLots]);

  const selectedAddProduct = inventoryItems.find((p) => p.id === addProductItemId);
  const addProductPriceLocked = Boolean(selectedAddProduct && !selectedAddProduct.allow_price_override_on_sale);

  const paymentEditorMethods =
    acceptedPaymentMethods.length > 0
      ? acceptedPaymentMethods
      : (Object.keys(HUB_PAYMENT_METHOD_LABELS) as HubPaymentMethod[]);

  const paymentLinesEditor =
    canRegisterPayment && detail ? (
      <CheckoutPaymentLinesEditor
        due={selectedBalance > 0.009 ? selectedBalance : Number(detail.final_amount ?? 0)}
        lines={paymentLines}
        onChange={setPaymentLines}
        acceptedMethods={paymentEditorMethods}
        cashSessionOpen={Boolean(cashSessionId)}
        allowMultiple
        disabled={paymentLoading}
        cardMachineFees={cardMachineFees}
      />
    ) : null;

  const receivableSelector =
    receivableIds.length > 1 ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {receivableIds.map((rid) => (
          <button
            key={rid}
            type="button"
            className={`hub-clientes__btn hub-clientes__btn--sm ${rid === activeReceivableId ? 'hub-clientes__btn--primary' : 'hub-clientes__btn--outline'}`}
            onClick={() => onSelectReceivable(rid)}
          >
            #{rid.slice(0, 8)}
          </button>
        ))}
      </div>
    ) : null;

  if (!receivableIds.length) {
    return (
      <div className={drawerLayout ? undefined : 'hub-clientes__panel-scroll'}>
        {!hideHeader ? <h2 className="hub-clientes__panel-title">Cobrança</h2> : null}
        <p className="hub-clientes__muted">Nenhum recebível vinculado a esta comanda.</p>
      </div>
    );
  }

  const billingActionSection =
    showBillingActions && detail ? (
      <CheckoutDrawerBillingShell
        ref={paymentSectionRef}
        className={showHighlight ? 'hub-finance-page__panel-section--highlight' : undefined}
      >
        <CheckoutDrawerActionTabs
          action={billingAction}
          onActionChange={setBillingAction}
          tabs={[
            ...(canRegisterPayment ? [{ value: 'receive_now' as const, label: 'Receber agora' }] : []),
            ...(canCancelReceivable ? [{ value: 'cancel' as const, label: 'Cancelar' }] : []),
          ]}
        />

        {billingAction === 'receive_now' && canRegisterPayment ? paymentLinesEditor : null}

        {billingAction === 'cancel' && canCancelReceivable ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <HubReceivableCancelIntentField
              idPrefix="comanda-fin-cancel"
              value={cancelIntent}
              onChange={setCancelIntent}
              disabled={paymentLoading}
            />
            <CheckoutDrawerCancelReasonField
              id="comanda-fin-cancel-reason"
              value={cancelReason}
              onChange={setCancelReason}
            />
            {pendingMerchandiseLines.length > 0 ? (
              <HubMerchandiseReturnSection
                idPrefix="comanda-fin-cancel-stock"
                lines={pendingMerchandiseLines}
                value={cancelMerchandiseReturn}
                onChange={setCancelMerchandiseReturn}
                disabled={paymentLoading}
              />
            ) : null}
          </div>
        ) : null}
      </CheckoutDrawerBillingShell>
    ) : null;

  // Devolução física também disponível em "Registrar devolução" (abaixo),
  // independente do cancelamento financeiro.
  const showStandaloneMerchandiseReturn =
    pendingMerchandiseLines.length > 0 && hasPermission('hub.financial.write');

  const reversePayment = useMemo(
    () => (detail?.payments ?? []).find((p) => p.id === reversePaymentId) ?? null,
    [detail?.payments, reversePaymentId],
  );

  const reversePaymentSummary = reversePayment
    ? {
        id: reversePayment.id,
        amount: Number(reversePayment.amount),
        payment_method: String(reversePayment.payment_method),
        installments: Number(reversePayment.installments ?? 1),
        payment_date: reversePayment.payment_date,
        cash_session_status: reversePayment.cash_session_status ?? null,
      }
    : null;

  const paymentFields = !drawerLayout && canRegisterPayment ? (
    <div
      ref={paymentSectionRef}
      className={showHighlight ? 'hub-finance-page__panel-section--highlight' : undefined}
    >
      {selectedBalance > 0.009 ? (
        <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
          Saldo pendente de {formatBrl(selectedBalance)} — registre a baixa abaixo (aceita misto + troco).
        </p>
      ) : null}
      {paymentLinesEditor}
      {!drawerLayout ? (
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          style={{ marginTop: 12 }}
          disabled={paymentLoading}
          onClick={() => void onCreatePayment()}
        >
          {paymentLoading ? 'Registrando…' : 'Registrar pagamento'}
        </button>
      ) : null}
      {canHistoricalCash ? (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            onClick={() => setHistoricalOpen((v) => !v)}
          >
            {historicalOpen ? 'Ocultar correção histórica' : 'Correção histórica em dinheiro'}
          </button>
          {historicalOpen ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <p className="hub-clientes__muted">
                Não abre caixa nem altera sessão fechada. Exige justificativa e fica auditado.
              </p>
              <label className="hub-clientes__label">
                Valor
                <input
                  className="hub-clientes__input"
                  value={historicalAmount}
                  onChange={(e) => setHistoricalAmount(e.target.value)}
                />
              </label>
              <HubDateField
                id="historical-cash-date-drawer"
                label="Data efetiva"
                valueIso={historicalDate}
                onChangeIso={setHistoricalDate}
                showTodayButton={false}
              />
              <label className="hub-clientes__label">
                Justificativa
                <textarea
                  className="hub-clientes__input"
                  rows={2}
                  value={historicalReason}
                  onChange={(e) => setHistoricalReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={paymentLoading}
                onClick={() => void onHistoricalCash()}
              >
                Registrar correção histórica
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : !drawerLayout && canHistoricalCash ? (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--ghost"
        onClick={() => setHistoricalOpen((v) => !v)}
      >
        {historicalOpen ? 'Ocultar correção histórica' : 'Correção histórica em dinheiro'}
      </button>
      {historicalOpen ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <p className="hub-clientes__muted">
            Não abre caixa nem altera sessão fechada. Exige justificativa e fica auditado.
          </p>
          <label className="hub-clientes__label">
            Valor
            <input
              className="hub-clientes__input"
              value={historicalAmount}
              onChange={(e) => setHistoricalAmount(e.target.value)}
            />
          </label>
          <HubDateField
            id="historical-cash-date"
            label="Data efetiva"
            valueIso={historicalDate}
            onChangeIso={setHistoricalDate}
            showTodayButton={false}
          />
          <label className="hub-clientes__label">
            Justificativa
            <textarea
              className="hub-clientes__input"
              rows={2}
              value={historicalReason}
              onChange={(e) => setHistoricalReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={paymentLoading}
            onClick={() => void onHistoricalCash()}
          >
            Registrar correção histórica
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  const linesTable = detail?.lines?.length ? (
    <div className="hub-checkout-drawer__items-table-wrap">
      <table className="hub-checkout-drawer__items-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Tipo</th>
            <th>Qtd</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((line) => (
            <tr key={line.id}>
              <td>
                <strong>{line.description || lineTypeLabel(line)}</strong>
              </td>
              <td className="hub-checkout-drawer__cell-muted">{lineTypeLabel(line)}</td>
              <td className="hub-checkout-drawer__cell-muted">{Number(line.quantity ?? 0)}</td>
              <td>
                <strong>{formatBrl(Number(line.line_total ?? 0))}</strong>
              </td>
              <td className="hub-clientes__td-actions">
                {line.line_kind === 'product' && canRemoveProductLine ? (
                  <div className="hub-clientes__td-actions-inner hub-checkout-drawer__row-actions">
                    <button
                      type="button"
                      className="hub-dayboard__action-btn hub-dayboard__action-btn--danger"
                      title="Remover produto"
                      aria-label="Remover produto"
                      onClick={() => void onRemoveProductLine(line.id)}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="hub-clientes__muted">Sem linhas carregadas.</p>
  );

  const paymentsTable =
    selectedPayments.length === 0 ? (
      <p className="hub-clientes__muted">Nenhum pagamento registrado.</p>
    ) : (
      <div className="hub-checkout-drawer__items-table-wrap">
        <table className="hub-checkout-drawer__items-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Método</th>
              <th>Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {selectedPayments.map((payment) => {
              const isReversed = String(payment.status ?? 'posted') === 'reversed';
              return (
              <tr key={payment.id} style={isReversed ? { opacity: 0.65 } : undefined}>
                <td>{formatDateTime(payment.payment_date)}</td>
                <td className="hub-checkout-drawer__cell-muted">
                  {HUB_PAYMENT_METHOD_LABELS[payment.payment_method as HubPaymentMethod] ?? payment.payment_method}
                  {Number(payment.installments ?? 1) > 1 ? ` · ${payment.installments}x` : null}
                  {isReversed ? ' · anulado/reembolsado' : null}
                  {payment.posting_kind === 'historical_correction' ? ' · correção histórica' : null}
                  {payment.card_fee_amount != null && Number(payment.card_fee_amount) > 0.009
                    ? ` · taxa ${formatBrl(Number(payment.card_fee_amount))}`
                    : null}
                </td>
                <td>
                  <strong>{formatBrl(Number(payment.amount ?? 0))}</strong>
                  {payment.net_amount != null &&
                  Number(payment.card_fee_amount ?? 0) > 0.009 ? (
                    <div className="hub-checkout-drawer__cell-muted" style={{ fontSize: 12 }}>
                      líquido {formatBrl(Number(payment.net_amount))}
                    </div>
                  ) : null}
                </td>
                <td className="hub-clientes__td-actions">
                  <div className="hub-clientes__td-actions-inner hub-checkout-drawer__row-actions">
                    {!isReversed ? (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn"
                        title="Gerar comprovante"
                        aria-label="Gerar comprovante"
                        onClick={() => void openHubPaymentReceiptPdf(payment.id, clinicId!)}
                      >
                        <Receipt size={15} strokeWidth={2} />
                      </button>
                    ) : null}
                    {!isReversed && hasPermission('hub.payments.reverse') ? (
                      <button
                        type="button"
                        className="hub-dayboard__action-btn hub-dayboard__action-btn--danger"
                        title="Estornar pagamento"
                        aria-label="Estornar pagamento"
                        onClick={() => openReverseForPayment(payment.id)}
                      >
                        <RotateCcw size={15} strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    );

  const detailBody = !detail ? (
    <p className="hub-clientes__muted">Recebível não encontrado.</p>
  ) : drawerLayout ? (
    <>
      <CheckoutDrawerHero
        guardianName={detail.guardian?.full_name ?? ''}
        guardianPhone={detail.guardian?.phone}
        petNames={petNames}
        badges={
          <>
            <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
            <ReceivableStockReturnBadge status={detail.stock_return_status} />
            <span className="hub-checkout-drawer__origin-badge">
              {formatDateTime(detail.created_at)}
            </span>
          </>
        }
      />

      <CheckoutDrawerSummaryGrid>
        <CheckoutDrawerSummaryCell
          label="Original"
          value={formatBrl(Number(detail.original_amount ?? detail.final_amount ?? 0))}
        />
        {Number(detail.returned_amount ?? 0) > 0.009 ? (
          <CheckoutDrawerSummaryCell
            label="Devolvido"
            value={formatBrl(Number(detail.returned_amount ?? 0))}
          />
        ) : null}
        <CheckoutDrawerSummaryCell label="Vigente" value={formatBrl(Number(detail.final_amount ?? 0))} />
        <CheckoutDrawerSummaryCell label="Pago líquido" value={formatBrl(selectedPaid)} />
        <CheckoutDrawerSummaryCell label="Saldo" value={formatBrl(selectedBalance)} highlight />
      </CheckoutDrawerSummaryGrid>

      <CheckoutDrawerSection
        title={`Linhas do recebível (${detail.lines?.length ?? 0})`}
        action={
          canAddProductLine && !showAddProduct ? (
            <button
              type="button"
              className="hub-quote-detail__text-btn"
              onClick={() => void openAddProductForm()}
            >
              <Plus size={14} strokeWidth={2.25} aria-hidden /> Incluir produto
            </button>
          ) : null
        }
      >
        {showAddProduct ? (
          <div className="hub-sell-package__line-card" style={{ marginBottom: 12 }}>
            <p className="hub-clientes__muted hub-sell-package__hint" style={{ marginTop: 0 }}>
              Adiciona produto ao recebível e baixa o estoque.
            </p>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="recv-add-product">
                Produto
              </label>
              <HubSearchableCombobox
                id="recv-add-product"
                options={addProductOptions}
                value={addProductItemId}
                onChange={onSelectAddProductItem}
                placeholder="— Selecionar produto —"
                searchPlaceholder="Nome, EAN ou SKU…"
                ariaLabel="Produto"
              />
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="recv-add-lot">
                Lote
              </label>
              <HubSearchableCombobox
                id="recv-add-lot"
                options={addProductLotOptions}
                value={addProductLotId}
                onChange={setAddProductLotId}
                placeholder="— Lote —"
                searchPlaceholder="Buscar lote…"
                ariaLabel="Lote"
                disabled={!addProductItemId}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="hub-clientes__label" style={{ flex: '1 1 100px' }}>
                Qtd
                <input
                  className="hub-clientes__input"
                  value={addProductQty}
                  onChange={(e) => setAddProductQty(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="hub-clientes__label" style={{ flex: '1 1 140px' }}>
                Valor unit.
                <input
                  className="hub-clientes__input"
                  value={addProductUnitAmount}
                  readOnly={addProductPriceLocked}
                  title={
                    addProductPriceLocked
                      ? 'Preço fixo no catálogo (override desabilitado).'
                      : undefined
                  }
                  onChange={(e) => {
                    if (addProductPriceLocked) return;
                    setAddProductUnitAmount(e.target.value);
                  }}
                  inputMode="decimal"
                />
              </label>
            </div>
            <div className="hub-sell-package__footer" style={{ padding: 0, marginTop: 10 }}>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                onClick={() => setShowAddProduct(false)}
                disabled={addProductLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                onClick={() => void onAddProductLine()}
                disabled={addProductLoading}
              >
                {addProductLoading ? 'Salvando…' : 'Adicionar produto'}
              </button>
            </div>
          </div>
        ) : null}
        {linesTable}
      </CheckoutDrawerSection>

      {billingActionSection}

      {showStandaloneMerchandiseReturn ? (
        <CheckoutDrawerSection
          title="Devolução de mercadorias"
          hint={
            standaloneReturnOpen
              ? estimatedFinancialRefund > 0.009
                ? 'Marque só os itens (quantidade integral). O reembolso financeiro só ocorre se o pago superar o líquido restante.'
                : financeReversalDone
                  ? 'Estorno já registrado — confirme só a devolução física ao estoque.'
                  : 'Marque só os itens (quantidade integral). Sem reembolso financeiro se o saldo a receber absorver a devolução.'
              : 'Devolva um ou mais itens sem precisar estornar a comanda inteira.'
          }
          action={
            !standaloneReturnOpen ? (
              <button
                type="button"
                className="hub-quote-detail__text-btn"
                onClick={() => {
                  setStandaloneNeedFinanceHandoff(false);
                  setStandaloneReturnOpen(true);
                  setStandaloneMerchandiseReturn(assumedMerchandiseReturnValue(pendingMerchandiseLines));
                }}
              >
                Registrar devolução
              </button>
            ) : null
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <ReceivableStockReturnBadge status={detail.stock_return_status} />
          </div>
          {standaloneReturnOpen ? (
            <div className="hub-merch-return-form">
              {standaloneNeedFinanceHandoff ? (
                <div className="hub-adjustments__warning" role="status">
                  <p style={{ margin: '0 0 8px' }}>
                    Há valor financeiro a devolver nesta cobrança. Você não tem permissão para reembolsar —
                    peça ao financeiro para concluir a devolução dos itens.
                  </p>
                  <Link to={FINANCE_ESTORNOS_HREF} className="hub-clientes__link-btn">
                    Ir ao Financeiro (Estornos)
                  </Link>
                </div>
              ) : null}
              {!standaloneNeedFinanceHandoff ? (
                <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
                  Comercial dos itens:{' '}
                  <strong>
                    {formatBrl(
                      selectedMerchandiseAmount(pendingMerchandiseLines, standaloneMerchandiseReturn),
                    )}
                  </strong>
                  {estimatedFinancialRefund > 0.009 ? (
                    <>
                      {' '}
                      · reembolso financeiro estimado: <strong>{formatBrl(estimatedFinancialRefund)}</strong>
                    </>
                  ) : (
                    <> · sem reembolso financeiro (ajuste só o saldo a receber)</>
                  )}
                  .
                </p>
              ) : null}
              {financeReversalDone && !standaloneNeedFinanceHandoff ? (
                <p className="hub-clientes__muted" style={{ marginTop: 0 }}>
                  Estorno já registrado — só confirmação de estoque.
                </p>
              ) : null}
              <div className="hub-merch-return-form__reason">
                <label className="hub-clientes__label" htmlFor="recv-standalone-return-reason">
                  Motivo
                  <textarea
                    id="recv-standalone-return-reason"
                    className="hub-clientes__input"
                    rows={3}
                    value={standaloneReturnReason}
                    onChange={(e) => setStandaloneReturnReason(e.target.value)}
                    placeholder="Ex.: Cliente devolveu o produto no dia seguinte"
                  />
                </label>
              </div>
              <HubMerchandiseReturnSection
                idPrefix="recv-standalone-stock"
                lines={pendingMerchandiseLines}
                value={standaloneMerchandiseReturn}
                onChange={setStandaloneMerchandiseReturn}
                disabled={paymentLoading || standaloneNeedFinanceHandoff}
                confirmMode="assumed"
                showHeading={false}
              />
              {estimatedFinancialRefund > 0.009 && !standaloneNeedFinanceHandoff ? (
                <div className="hub-merch-return-form__refund" style={{ display: 'grid', gap: 10 }}>
                  <HubSearchableCombobox
                    id="recv-standalone-refund-method"
                    label="Forma do reembolso"
                    options={standaloneRefundMethodOptions(
                      Boolean(detail.guardian_id || detail.guardian?.id),
                    )}
                    value={standaloneRefundMethod}
                    onChange={setStandaloneRefundMethod}
                    disabled={paymentLoading}
                  />
                  {!detail.guardian_id && !detail.guardian?.id ? (
                    <p className="hub-clientes__muted" style={{ margin: 0 }}>
                      Sem tutor nesta cobrança — crédito do tutor não está disponível.
                    </p>
                  ) : null}
                  <HubDateField
                    id="recv-standalone-refund-date"
                    label="Data efetiva"
                    valueIso={standaloneRefundDate}
                    onChangeIso={setStandaloneRefundDate}
                    showTodayButton
                  />
                </div>
              ) : null}
              <div className="hub-merch-return-form__actions">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  disabled={paymentLoading}
                  onClick={() => resetStandaloneReturn()}
                >
                  Cancelar
                </button>
                {standaloneNeedFinanceHandoff ? null : (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary"
                    disabled={
                      paymentLoading ||
                      standaloneReturnReason.trim().length < 3 ||
                      standaloneMerchandiseReturn.selectedLineIds.length === 0 ||
                      !standaloneMerchandiseReturn.condition
                    }
                    onClick={() => onAttemptMerchandiseReturn()}
                  >
                    {paymentLoading
                      ? 'Salvando…'
                      : estimatedFinancialRefund > 0.009
                        ? 'Confirmar devolução e reembolso'
                        : 'Confirmar devolução'}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </CheckoutDrawerSection>
      ) : detail.stock_return_status ? (
        <CheckoutDrawerSection title="Devolução de mercadorias">
          <ReceivableStockReturnBadge status={detail.stock_return_status} />
        </CheckoutDrawerSection>
      ) : null}

      <CheckoutDrawerSection title="Pagamentos">{paymentsTable}</CheckoutDrawerSection>

      {reversePaymentId && reversePaymentSummary ? (
        <CheckoutDrawerSection
          title={
            reversePrefillMerch?.returned
              ? 'Estorno financeiro necessário'
              : 'Estornar pagamento'
          }
          hint={
            reversePrefillMerch?.returned
              ? 'Devolução física marcada — conclua o reembolso para fechar o ciclo (financeiro + estoque).'
              : undefined
          }
        >
          {reverseQueue.length > 0 ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
              Ainda restam {reverseQueue.length} pagamento{reverseQueue.length === 1 ? '' : 's'} nesta
              cobrança — após este, abrimos o próximo.
            </p>
          ) : null}
          <HubPaymentReversalForm
            key={`${reversePaymentId}-${reverseInitialMode}-${reversePrefillMerch?.condition ?? 'none'}-${reverseQueue.length}`}
            clinicId={clinicId}
            payment={reversePaymentSummary}
            originLabel={formatComandaOriginLabel(detail.source_type)}
            allowCustomerCreditRefund={Boolean(detail.guardian_id || detail.guardian?.id)}
            receivableSnapshot={{
              final_amount: Number(detail.final_amount ?? 0),
              returned_amount: Number(detail.returned_amount ?? 0),
              line_refunds_amount: Number(detail.line_refunds_amount ?? 0),
              paid_amount: Number(detail.paid_amount ?? 0),
            }}
            merchandiseLines={merchandiseLines}
            stockReturnStatus={detail.stock_return_status}
            initialMode={reverseInitialMode}
            initialReason={reverseInitialReason}
            initialMerchandiseReturn={reversePrefillMerch ?? undefined}
            idPrefix="recv-rev"
            subtitle={null}
            onCancel={closeReverseForm}
            onSuccess={onReverseFormSuccess}
          />
        </CheckoutDrawerSection>
      ) : null}
    </>
  ) : (
    <>
      <div className="hub-finance-page__detail-hero">
        <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
        <ReceivableStockReturnBadge status={detail.stock_return_status} />
        <strong>{formatBrl(Number(detail.final_amount))}</strong>
        <span className="hub-clientes__muted">Criado em {formatDateTime(detail.created_at)}</span>
      </div>

      <section className="hub-finance-page__panel-section">
        <h3 className="hub-finance-page__subsection-title">Resumo financeiro</h3>
        <div className="hub-finance-page__detail-grid">
          <div>
            <span>Original</span>
            <strong>{formatBrl(Number(detail.original_amount ?? 0))}</strong>
          </div>
          {Number(detail.returned_amount ?? 0) > 0.009 ? (
            <div>
              <span>Devolvido</span>
              <strong>{formatBrl(Number(detail.returned_amount ?? 0))}</strong>
            </div>
          ) : null}
          <div>
            <span>Vigente</span>
            <strong>{formatBrl(Number(detail.final_amount ?? 0))}</strong>
          </div>
          <div>
            <span>Pago líquido</span>
            <strong>{formatBrl(selectedPaid)}</strong>
          </div>
          <div>
            <span>Saldo</span>
            <strong>{formatBrl(selectedBalance)}</strong>
          </div>
        </div>
      </section>

      {paymentFields}

      <section className="hub-finance-page__panel-section">
        <h3 className="hub-finance-page__subsection-title">Linhas do recebível</h3>
        {linesTable}
      </section>

      {showStandaloneMerchandiseReturn ? (
        <section className="hub-finance-page__panel-section">
          <h3 className="hub-finance-page__subsection-title">Devolução de mercadorias</h3>
          <ReceivableStockReturnBadge status={detail.stock_return_status} />
          {!standaloneReturnOpen ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                setStandaloneNeedFinanceHandoff(false);
                setStandaloneReturnOpen(true);
                setStandaloneMerchandiseReturn(assumedMerchandiseReturnValue(pendingMerchandiseLines));
              }}
            >
              Registrar devolução
            </button>
          ) : (
            <div className="hub-merch-return-form" style={{ marginTop: 10 }}>
              {standaloneNeedFinanceHandoff ? (
                <div className="hub-adjustments__warning" role="status">
                  <p style={{ margin: '0 0 8px' }}>
                    Há valor financeiro a devolver. Você não tem permissão para reembolsar — peça ao
                    financeiro.
                  </p>
                  <Link to={FINANCE_ESTORNOS_HREF} className="hub-clientes__link-btn">
                    Ir ao Financeiro (Estornos)
                  </Link>
                </div>
              ) : null}
              {!standaloneNeedFinanceHandoff ? (
                <p className="hub-clientes__muted">
                  Comercial dos itens:{' '}
                  <strong>
                    {formatBrl(
                      selectedMerchandiseAmount(pendingMerchandiseLines, standaloneMerchandiseReturn),
                    )}
                  </strong>
                  {estimatedFinancialRefund > 0.009 ? (
                    <>
                      {' '}
                      · reembolso financeiro estimado: <strong>{formatBrl(estimatedFinancialRefund)}</strong>
                    </>
                  ) : (
                    <> · sem reembolso financeiro (ajuste só o saldo a receber)</>
                  )}
                  .
                </p>
              ) : null}
              <div className="hub-merch-return-form__reason">
                <label className="hub-clientes__label" htmlFor="recv-page-return-reason">
                  Motivo
                  <textarea
                    id="recv-page-return-reason"
                    className="hub-clientes__input"
                    rows={3}
                    value={standaloneReturnReason}
                    onChange={(e) => setStandaloneReturnReason(e.target.value)}
                    placeholder="Ex.: Cliente devolveu o produto no dia seguinte"
                  />
                </label>
              </div>
              <HubMerchandiseReturnSection
                idPrefix="recv-page-stock"
                lines={pendingMerchandiseLines}
                value={standaloneMerchandiseReturn}
                onChange={setStandaloneMerchandiseReturn}
                disabled={paymentLoading || standaloneNeedFinanceHandoff}
                confirmMode="assumed"
                showHeading={false}
              />
              {estimatedFinancialRefund > 0.009 && !standaloneNeedFinanceHandoff ? (
                <div className="hub-merch-return-form__refund" style={{ display: 'grid', gap: 10 }}>
                  <HubSearchableCombobox
                    id="recv-page-refund-method"
                    label="Forma do reembolso"
                    options={standaloneRefundMethodOptions(
                      Boolean(detail.guardian_id || detail.guardian?.id),
                    )}
                    value={standaloneRefundMethod}
                    onChange={setStandaloneRefundMethod}
                    disabled={paymentLoading}
                  />
                  {!detail.guardian_id && !detail.guardian?.id ? (
                    <p className="hub-clientes__muted" style={{ margin: 0 }}>
                      Sem tutor nesta cobrança — crédito do tutor não está disponível.
                    </p>
                  ) : null}
                  <HubDateField
                    id="recv-page-refund-date"
                    label="Data efetiva"
                    valueIso={standaloneRefundDate}
                    onChangeIso={setStandaloneRefundDate}
                    showTodayButton
                  />
                </div>
              ) : null}
              <div className="hub-merch-return-form__actions">
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost"
                  disabled={paymentLoading}
                  onClick={() => resetStandaloneReturn()}
                >
                  Cancelar
                </button>
                {standaloneNeedFinanceHandoff ? null : (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary"
                    disabled={
                      paymentLoading ||
                      standaloneReturnReason.trim().length < 3 ||
                      standaloneMerchandiseReturn.selectedLineIds.length === 0 ||
                      !standaloneMerchandiseReturn.condition
                    }
                    onClick={() => onAttemptMerchandiseReturn()}
                  >
                    {paymentLoading
                      ? 'Salvando…'
                      : estimatedFinancialRefund > 0.009
                        ? 'Confirmar devolução e reembolso'
                        : 'Confirmar devolução'}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      ) : detail.stock_return_status ? (
        <section className="hub-finance-page__panel-section">
          <h3 className="hub-finance-page__subsection-title">Devolução de mercadorias</h3>
          <ReceivableStockReturnBadge status={detail.stock_return_status} />
        </section>
      ) : null}

      <section className="hub-finance-page__panel-section">
        <h3 className="hub-finance-page__subsection-title">Pagamentos</h3>
        {paymentsTable}
      </section>

      {reversePaymentId && reversePaymentSummary ? (
        <section className="hub-finance-page__panel-section">
          <h3 className="hub-finance-page__subsection-title">
            {reversePrefillMerch?.returned ? 'Estorno financeiro necessário' : 'Estornar pagamento'}
          </h3>
          {reverseQueue.length > 0 ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 8 }}>
              Ainda restam {reverseQueue.length} pagamento{reverseQueue.length === 1 ? '' : 's'} nesta
              cobrança — após este, abrimos o próximo.
            </p>
          ) : null}
          <HubPaymentReversalForm
            key={`${reversePaymentId}-${reverseInitialMode}-${reversePrefillMerch?.condition ?? 'none'}-${reverseQueue.length}`}
            clinicId={clinicId}
            payment={reversePaymentSummary}
            originLabel={formatComandaOriginLabel(detail.source_type)}
            allowCustomerCreditRefund={Boolean(detail.guardian_id || detail.guardian?.id)}
            receivableSnapshot={{
              final_amount: Number(detail.final_amount ?? 0),
              returned_amount: Number(detail.returned_amount ?? 0),
              line_refunds_amount: Number(detail.line_refunds_amount ?? 0),
              paid_amount: Number(detail.paid_amount ?? 0),
            }}
            merchandiseLines={merchandiseLines}
            stockReturnStatus={detail.stock_return_status}
            initialMode={reverseInitialMode}
            initialReason={reverseInitialReason}
            initialMerchandiseReturn={reversePrefillMerch ?? undefined}
            idPrefix="recv-rev-page"
            subtitle={null}
            onCancel={closeReverseForm}
            onSuccess={onReverseFormSuccess}
          />
        </section>
      ) : null}
    </>
  );

  return (
    <div className={drawerLayout ? 'hub-checkout-drawer__content' : 'hub-clientes__panel-scroll'}>
      {!hideHeader ? (
        <div className="hub-clientes__panel-header">
          <div>
            <h2 className="hub-clientes__panel-title">Cobrança</h2>
            <p className="hub-clientes__muted">Recebível da comanda</p>
          </div>
        </div>
      ) : null}

      {receivableSelector}

      <HubRefreshingBanner show={refreshing} label="Atualizando cobrança…" />
      {loading && !detail ? <HubLoading variant="block" label="Carregando recebível…" /> : detailBody}
    </div>
  );
};

export default HubComandaReceivablePanel;
