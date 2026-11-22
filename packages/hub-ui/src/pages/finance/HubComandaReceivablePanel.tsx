import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  openHubPaymentReceiptPdf,
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
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
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
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
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
    setPaymentLoading(true);
    try {
      await hubFinancialApi.cancelReceivable(detail.id, { clinic_id: clinicId, reason: cancelReason.trim() });
      showSuccess('Recebível cancelado.');
      setCancelReason('');
      await loadDetail();
      onRefreshComanda?.();
      onCancelSuccess?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao cancelar recebível');
    } finally {
      setPaymentLoading(false);
    }
  }, [clinicId, detail, hasPermission, cancelReason, showError, showSuccess, loadDetail, onRefreshComanda, onCancelSuccess]);

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

  const onReversePayment = async () => {
    if (!clinicId || !reversePaymentId) return;
    if (!hasPermission('hub.payments.reverse')) {
      showError('Sem permissão para estornar pagamentos.');
      return;
    }
    if (!reverseReason.trim() || reverseReason.trim().length < 3) {
      showError('Informe o motivo do estorno (mín. 3 caracteres).');
      return;
    }
    try {
      await hubFinancialApi.reversePayment(reversePaymentId, {
        clinic_id: clinicId,
        reason: reverseReason.trim(),
        mode: 'payment_reversal',
      });
      showSuccess('Lançamento anulado.');
      setReversePaymentId(null);
      setReverseReason('');
      await loadDetail();
      onRefreshComanda?.();
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    }
  };

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
          <CheckoutDrawerCancelReasonField
            id="comanda-fin-cancel-reason"
            value={cancelReason}
            onChange={setCancelReason}
          />
        ) : null}
      </CheckoutDrawerBillingShell>
    ) : null;

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
              <label className="hub-clientes__label">
                Data efetiva
                <input
                  type="date"
                  className="hub-clientes__input"
                  value={historicalDate}
                  onChange={(e) => setHistoricalDate(e.target.value)}
                />
              </label>
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
          <label className="hub-clientes__label">
            Data efetiva
            <input
              type="date"
              className="hub-clientes__input"
              value={historicalDate}
              onChange={(e) => setHistoricalDate(e.target.value)}
            />
          </label>
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
                {line.line_kind === 'product' ? (
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
                        onClick={() => {
                          setReversePaymentId(payment.id);
                          setReverseReason('');
                        }}
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
            <span className="hub-checkout-drawer__origin-badge">
              {formatDateTime(detail.created_at)}
            </span>
          </>
        }
      />

      <CheckoutDrawerSummaryGrid>
        <CheckoutDrawerSummaryCell label="Valor final" value={formatBrl(Number(detail.final_amount ?? 0))} />
        <CheckoutDrawerSummaryCell label="Pago" value={formatBrl(selectedPaid)} />
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

      <CheckoutDrawerSection title="Pagamentos">{paymentsTable}</CheckoutDrawerSection>

      {reversePaymentId ? (
        <CheckoutDrawerSection title="Estornar pagamento">
          <p className="hub-clientes__muted">
            Estornando pagamento <strong>{reversePaymentId.slice(0, 8)}…</strong>
          </p>
          <textarea
            className="hub-clientes__input"
            rows={2}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder="Motivo do estorno (mín. 3 caracteres)"
          />
          <div className="hub-finance-page__drawer-footer" style={{ marginTop: 8, padding: 0 }}>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => setReversePaymentId(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!reverseReason.trim() || reverseReason.trim().length < 3}
              onClick={() => void onReversePayment()}
            >
              Confirmar estorno
            </button>
          </div>
        </CheckoutDrawerSection>
      ) : null}
    </>
  ) : (
    <>
      <div className="hub-finance-page__detail-hero">
        <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
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
          <div>
            <span>Final</span>
            <strong>{formatBrl(Number(detail.final_amount ?? 0))}</strong>
          </div>
          <div>
            <span>Pago</span>
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

      <section className="hub-finance-page__panel-section">
        <h3 className="hub-finance-page__subsection-title">Pagamentos</h3>
        {paymentsTable}
      </section>

      {reversePaymentId ? (
        <section className="hub-finance-page__panel-section">
          <h3 className="hub-finance-page__subsection-title">Estornar pagamento</h3>
          <p className="hub-clientes__muted">
            Estornando pagamento <strong>{reversePaymentId.slice(0, 8)}…</strong>
          </p>
          <textarea
            className="hub-clientes__input"
            rows={2}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder="Motivo do estorno (mín. 3 caracteres)"
          />
          <div className="hub-clientes__footer-btns" style={{ marginTop: 8 }}>
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => setReversePaymentId(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!reverseReason.trim() || reverseReason.trim().length < 3}
              onClick={() => void onReversePayment()}
            >
              Confirmar estorno
            </button>
          </div>
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
