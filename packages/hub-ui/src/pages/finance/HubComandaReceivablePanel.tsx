import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubFinancialApi,
  openHubPaymentReceiptPdf,
  type HubFinanceReceivableDetail,
  type HubPaymentMethod,
} from '../../api/hubFinancialApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
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
  CheckoutDrawerPaymentFields,
  CheckoutDrawerSection,
  CheckoutDrawerSummaryCell,
  CheckoutDrawerSummaryGrid,
  type CheckoutDrawerBillingAction,
} from './checkoutDrawerParts';

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
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<HubPaymentMethod>('pix');
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<HubPaymentMethod[]>([]);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [billingAction, setBillingAction] = useState<CheckoutDrawerBillingAction>('receive_now');
  const [cancelReason, setCancelReason] = useState('');
  const [cashSessionId, setCashSessionId] = useState<string | null>(null);
  const [reversePaymentId, setReversePaymentId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [lineServiceTypes, setLineServiceTypes] = useState<HubServiceType[]>([]);
  const [comandaPetNames, setComandaPetNames] = useState<string[]>([]);
  const [showHighlight, setShowHighlight] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);

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
          setPaymentMethod((current) => (methods.includes(current) ? current : defaultPaymentMethod(methods)));
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
      hasPermission('hub.financial.write') &&
      !['cancelled', 'refunded', 'paid'].includes(detail.status),
  );

  const canCancelReceivable = Boolean(
    detail && hasPermission('hub.financial.write') && detail.status !== 'cancelled',
  );

  const showBillingActions = drawerLayout && (canRegisterPayment || canCancelReceivable);

  useEffect(() => {
    setBillingAction(canRegisterPayment ? 'receive_now' : 'cancel');
    setCancelReason('');
    setPaymentAmount('');
    setPaymentNotes('');
  }, [activeReceivableId, canRegisterPayment]);

  useEffect(() => {
    if (!drawerLayout || billingAction !== 'receive_now' || selectedBalance <= 0.009) return;
    setPaymentAmount(selectedBalance.toFixed(2).replace('.', ','));
  }, [drawerLayout, billingAction, selectedBalance, activeReceivableId]);

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
    if (!hasPermission('hub.financial.write')) {
      showError('Sem permissão para registrar pagamentos.');
      return;
    }
    const amount = Number(String(paymentAmount).replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Informe um valor de pagamento válido.');
      return;
    }
    setPaymentLoading(true);
    try {
      let sessionId: string | null = null;
      if (paymentMethod === 'cash') {
        const cash = await hubFinancialApi.getCashSessionOpen(clinicId, unitId);
        sessionId = cash.cash_session?.id ?? null;
        if (!sessionId) {
          showError('Abra o caixa para receber em dinheiro.');
          return;
        }
      }
      await hubFinancialApi.createReceivablePayment(detail.id, {
        clinic_id: clinicId,
        amount,
        payment_method: paymentMethod,
        notes: paymentNotes.trim() || null,
        cash_session_id: sessionId,
      });
      showSuccess('Pagamento registrado.');
      setPaymentAmount('');
      setPaymentNotes('');
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
    paymentAmount,
    paymentMethod,
    paymentNotes,
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

  const onReversePayment = async () => {
    if (!clinicId || !reversePaymentId) return;
    if (!hasPermission('hub.financial.write')) {
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
      });
      showSuccess('Pagamento estornado.');
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

  const paymentMethodOptions = (acceptedPaymentMethods.length > 0
    ? acceptedPaymentMethods
    : (Object.keys(HUB_PAYMENT_METHOD_LABELS) as HubPaymentMethod[])
  ).map((method) => ({ value: method, label: HUB_PAYMENT_METHOD_LABELS[method] }));

  const cashMethodHint =
    paymentMethod === 'cash' ? (
      <p className="hub-clientes__muted">
        {cashSessionId
          ? `Caixa aberto (sessão ${cashSessionId.slice(0, 8)}…)`
          : 'Não há caixa aberto — abra no módulo Caixa.'}
      </p>
    ) : cashSessionId ? (
      <p className="hub-clientes__muted">Sessão de caixa aberta — recebimento será registrado no histórico do dia.</p>
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

        {billingAction === 'receive_now' && canRegisterPayment ? (
          <CheckoutDrawerPaymentFields
            amountId="comanda-fin-payment-amount"
            amountLabel="Valor a receber agora"
            amount={paymentAmount}
            onAmountChange={setPaymentAmount}
            amountPlaceholder={formatBrl(selectedBalance > 0 ? selectedBalance : Number(detail.final_amount ?? 0))}
            onFillTotal={
              selectedBalance > 0.009
                ? () => setPaymentAmount(selectedBalance.toFixed(2).replace('.', ','))
                : undefined
            }
            methodId="comanda-fin-payment-method"
            methodLabel="Forma de pagamento"
            paymentMethod={paymentMethod}
            onPaymentMethodChange={(value) => setPaymentMethod(value as HubPaymentMethod)}
            paymentMethodOptions={paymentMethodOptions}
            methodHint={cashMethodHint}
          />
        ) : null}

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
      <CheckoutDrawerPaymentFields
        amountId="comanda-fin-payment-amount"
        amountLabel="Valor a receber agora"
        amount={paymentAmount}
        onAmountChange={setPaymentAmount}
        amountPlaceholder={formatBrl(selectedBalance > 0 ? selectedBalance : Number(detail?.final_amount ?? 0))}
        onFillTotal={
          selectedBalance > 0.009
            ? () => setPaymentAmount(selectedBalance.toFixed(2).replace('.', ','))
            : undefined
        }
        balanceHint={
          selectedBalance > 0.009
            ? `Saldo pendente de ${formatBrl(selectedBalance)} — registre a baixa abaixo.`
            : undefined
        }
        methodId="comanda-fin-payment-method"
        methodLabel="Forma de pagamento"
        paymentMethod={paymentMethod}
        onPaymentMethodChange={(value) => setPaymentMethod(value as HubPaymentMethod)}
        paymentMethodOptions={paymentMethodOptions}
        methodHint={cashMethodHint}
        notesId="comanda-fin-payment-notes"
        notes={paymentNotes}
        onNotesChange={setPaymentNotes}
      />
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
            {selectedPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{formatDateTime(payment.payment_date)}</td>
                <td className="hub-checkout-drawer__cell-muted">
                  {HUB_PAYMENT_METHOD_LABELS[payment.payment_method as HubPaymentMethod] ?? payment.payment_method}
                </td>
                <td>
                  <strong>{formatBrl(Number(payment.amount ?? 0))}</strong>
                </td>
                <td className="hub-clientes__td-actions">
                  <div className="hub-clientes__td-actions-inner hub-checkout-drawer__row-actions">
                    <button
                      type="button"
                      className="hub-dayboard__action-btn"
                      title="Gerar comprovante"
                      aria-label="Gerar comprovante"
                      onClick={() => void openHubPaymentReceiptPdf(payment.id, clinicId!)}
                    >
                      <Receipt size={15} strokeWidth={2} />
                    </button>
                    {hasPermission('hub.financial.write') ? (
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
            ))}
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

      <CheckoutDrawerSection title={`Linhas do recebível (${detail.lines?.length ?? 0})`}>{linesTable}</CheckoutDrawerSection>

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
