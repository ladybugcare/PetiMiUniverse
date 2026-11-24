import React, { useEffect, useState } from 'react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubFinancialApi, type HubPaymentMethod } from '../../api/hubFinancialApi';
import { useAlert } from '../../components/AlertProvider';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubDateField } from '../../components/HubDateField';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { paymentMethodLabel } from '../../utils/hubPaymentMethods';

const REFUND_METHOD_OPTIONS_BASE: HubComboboxOption[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'credit_card', label: 'Cartão de crédito' },
  { value: 'debit_card', label: 'Cartão de débito' },
  { value: 'other', label: 'Outro' },
];

const CUSTOMER_CREDIT_OPTION: HubComboboxOption = {
  value: 'customer_credit',
  label: 'Crédito do tutor',
};

function refundMethodOptions(allowCustomerCredit: boolean): HubComboboxOption[] {
  if (!allowCustomerCredit) return REFUND_METHOD_OPTIONS_BASE;
  return [
    REFUND_METHOD_OPTIONS_BASE[0],
    REFUND_METHOD_OPTIONS_BASE[1],
    REFUND_METHOD_OPTIONS_BASE[2],
    CUSTOMER_CREDIT_OPTION,
    ...REFUND_METHOD_OPTIONS_BASE.slice(3),
  ];
}
import {
  emptyMerchandiseReturnValue,
  HubMerchandiseReturnSection,
  merchandiseReturnApiFields,
  selectedMerchandiseAmount,
  type MerchandiseReturnLine,
  type MerchandiseReturnValue,
} from './HubMerchandiseReturnSection';
import { ReceivableStockReturnBadge, type StockReturnStatus } from './ReceivableStockReturnBadge';

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatPaymentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

const RECEIVABLE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

export type PaymentReversalMode = 'payment_reversal' | 'refund';

export type PaymentReversalSummary = {
  id: string;
  amount: number;
  payment_method: string;
  installments?: number;
  payment_date: string;
  cash_session_status?: 'open' | 'closed' | null;
};

/** Snapshot financeiro do recebível (após devoluções parciais). */
export type PaymentReversalReceivableSnapshot = {
  final_amount: number;
  returned_amount: number;
  line_refunds_amount: number;
  paid_amount?: number;
};

export type HubPaymentReversalFormProps = {
  clinicId?: string | null;
  /** Pagamento conhecido; se null, mostra campo para colar o código. */
  payment: PaymentReversalSummary | null;
  /** Prefill do código quando `payment` é null (estorno manual). */
  seedPaymentId?: string;
  /** Quando o código colado é UUID válido, o pai resolve o pagamento (produtos etc.). */
  onLookupPaymentId?: (paymentId: string) => void;
  /** Ex.: "Venda rápida" — ajuda a contextualizar devolução de produto. */
  originLabel?: string | null;
  /**
   * Crédito do tutor só faz sentido com tutor na cobrança.
   * Venda rápida sem tutor: omitir a opção (evita erro 409 no backend).
   */
  allowCustomerCreditRefund?: boolean;
  /** Valores vigentes do recebível — evita mostrar só o bruto do lançamento após parcial. */
  receivableSnapshot?: PaymentReversalReceivableSnapshot | null;
  merchandiseLines?: MerchandiseReturnLine[];
  stockReturnStatus?: StockReturnStatus;
  /** Enquanto carrega linhas/recebível (ex.: após abrir o pagamento). */
  loadingMerchandise?: boolean;
  initialMerchandiseReturn?: MerchandiseReturnValue;
  initialMode?: PaymentReversalMode;
  initialReason?: string;
  idPrefix?: string;
  cancelLabel?: string;
  subtitle?: string | null;
  onCancel: () => void;
  onSuccess?: (info: {
    mode: PaymentReversalMode;
    receivable_status: string;
    warning?: string | null;
  }) => void;
};

export const HubPaymentReversalForm: React.FC<HubPaymentReversalFormProps> = ({
  clinicId: clinicIdProp,
  payment,
  seedPaymentId = '',
  onLookupPaymentId,
  originLabel = null,
  allowCustomerCreditRefund = true,
  receivableSnapshot = null,
  merchandiseLines = [],
  stockReturnStatus,
  loadingMerchandise = false,
  initialMerchandiseReturn,
  initialMode = 'payment_reversal',
  initialReason = '',
  idPrefix = 'pay-rev',
  cancelLabel = 'Voltar',
  subtitle = 'O valor integral volta e o saldo da cobrança é recalculado.',
  onCancel,
  onSuccess,
}) => {
  const clinicId = clinicIdProp ?? getStoredClinicId();
  const { showError, showSuccess } = useAlert();

  const pendingMerchandise = merchandiseLines.some((l) => !l.alreadyReturned);
  const allMerchandiseReturned =
    merchandiseLines.length > 0 && merchandiseLines.every((l) => l.alreadyReturned);
  const hasPhysicalProducts = merchandiseLines.length > 0;
  const methodOptions = refundMethodOptions(allowCustomerCreditRefund);
  const returnedAmount = Number(receivableSnapshot?.returned_amount ?? 0);
  const lineRefundsAmount = Number(receivableSnapshot?.line_refunds_amount ?? 0);
  const finalAmount = Number(receivableSnapshot?.final_amount ?? NaN);
  const hasPartialReturn = returnedAmount > 0.009 || lineRefundsAmount > 0.009;
  const vigenteAmount = Number.isFinite(finalAmount)
    ? finalAmount
    : hasPartialReturn && payment
      ? Math.max(0, Number(payment.amount) - Math.max(returnedAmount, lineRefundsAmount))
      : payment
        ? Number(payment.amount)
        : 0;
  const alreadyRefundedAmount = Math.max(returnedAmount, lineRefundsAmount);

  const [manualDraft, setManualDraft] = useState(payment?.id ?? seedPaymentId);
  const [reason, setReason] = useState(initialReason);
  const [reversalMode, setReversalMode] = useState<PaymentReversalMode>(
    initialMode === 'refund' || initialMerchandiseReturn?.returned ? 'refund' : initialMode,
  );
  const [refundMethod, setRefundMethod] = useState('pix');
  const [refundDate, setRefundDate] = useState(() => todayIsoLocal());
  const [saving, setSaving] = useState(false);
  const [merchandiseReturn, setMerchandiseReturn] = useState<MerchandiseReturnValue>(
    initialMerchandiseReturn ?? emptyMerchandiseReturnValue(),
  );
  const [modeTouched, setModeTouched] = useState(false);

  useEffect(() => {
    setManualDraft(payment?.id ?? seedPaymentId);
    setReason(initialReason);
    setModeTouched(false);
    setRefundMethod('pix');
    setRefundDate(todayIsoLocal());
    setReversalMode(
      initialMode === 'refund' || initialMerchandiseReturn?.returned ? 'refund' : initialMode,
    );
    setMerchandiseReturn(initialMerchandiseReturn ?? emptyMerchandiseReturnValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remonta via key no pai
  }, [payment?.id, seedPaymentId]);

  useEffect(() => {
    if (allowCustomerCreditRefund) return;
    if (refundMethod === 'customer_credit') setRefundMethod('pix');
  }, [allowCustomerCreditRefund, refundMethod]);

  // Quando as linhas de produto chegam após o load do recebível, abrir em reembolso para mostrar a opção.
  useEffect(() => {
    if (modeTouched || loadingMerchandise) return;
    if (!pendingMerchandise) return;
    setReversalMode('refund');
  }, [pendingMerchandise, loadingMerchandise, modeTouched]);

  useEffect(() => {
    if (payment || !onLookupPaymentId) return;
    const id = manualDraft.trim();
    if (!isUuid(id)) return;
    const timer = window.setTimeout(() => onLookupPaymentId(id), 400);
    return () => window.clearTimeout(timer);
  }, [manualDraft, payment, onLookupPaymentId]);

  const cashClosed =
    payment?.payment_method === 'cash' && payment.cash_session_status === 'closed';
  const selectedReturnAmount = selectedMerchandiseAmount(merchandiseLines, merchandiseReturn);
  const confirmLabel = saving
    ? 'Salvando…'
    : reversalMode === 'refund'
      ? merchandiseReturn.returned && pendingMerchandise
        ? 'Confirmar reembolso e devolução'
        : 'Confirmar reembolso'
      : 'Confirmar anulação';

  const selectMode = (mode: PaymentReversalMode) => {
    setModeTouched(true);
    setReversalMode(mode);
    if (mode === 'payment_reversal') {
      setMerchandiseReturn(emptyMerchandiseReturnValue());
    }
  };

  const onConfirm = async () => {
    if (!clinicId) {
      showError('Selecione a clínica para continuar.');
      return;
    }
    const paymentId = (payment?.id ?? manualDraft).trim();
    if (!paymentId || !isUuid(paymentId)) {
      showError('Informe o código completo do pagamento.');
      return;
    }
    if (reason.trim().length < 3) {
      showError('Informe o motivo do estorno (mín. 3 caracteres).');
      return;
    }
    if (reversalMode === 'refund' && !refundDate) {
      showError('Informe a data efetiva do reembolso.');
      return;
    }
    if (reversalMode === 'refund' && refundMethod === 'customer_credit' && !allowCustomerCreditRefund) {
      showError('Esta cobrança não tem tutor — escolha Pix, dinheiro ou outra forma de reembolso.');
      return;
    }
    if (
      reversalMode === 'refund' &&
      pendingMerchandise &&
      merchandiseReturn.returned &&
      merchandiseReturn.selectedLineIds.length === 0
    ) {
      showError('Selecione ao menos um produto para devolver.');
      return;
    }
    if (
      reversalMode === 'refund' &&
      pendingMerchandise &&
      merchandiseReturn.returned &&
      !merchandiseReturn.condition
    ) {
      showError('Selecione se a mercadoria está apta ou não para revenda.');
      return;
    }

    setSaving(true);
    try {
      const stockFields =
        reversalMode === 'refund' && pendingMerchandise
          ? merchandiseReturnApiFields(merchandiseReturn)
          : {};
      const res = await hubFinancialApi.reversePayment(paymentId, {
        clinic_id: clinicId,
        reason: reason.trim(),
        mode: reversalMode,
        refund_method: reversalMode === 'refund' ? (refundMethod as HubPaymentMethod) : null,
        refund_effective_date: reversalMode === 'refund' ? refundDate : null,
        ...stockFields,
      });
      const status = RECEIVABLE_STATUS_LABELS[res.receivable_status] ?? res.receivable_status;
      const actionLabel = reversalMode === 'refund' ? 'Reembolso registrado' : 'Lançamento anulado';
      showSuccess(res.warning || `${actionLabel}. A cobrança ficou ${status.toLowerCase()}.`);
      onSuccess?.({
        mode: reversalMode,
        receivable_status: res.receivable_status,
        warning: res.warning ?? null,
      });
    } catch (e) {
      showError((e as Error)?.message || 'Erro ao estornar pagamento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hub-pay-rev-form hub-adjustments hub-payables hub-expenses">
      {subtitle ? <p className="hub-pay-rev-form__lead">{subtitle}</p> : null}

      {payment ? (
        <div className="hub-pay-rev-form__facts" aria-label="Pagamento selecionado">
          <div className="hub-pay-rev-form__fact hub-pay-rev-form__fact--wide">
            <span>Código da transação</span>
            <strong className="hub-adjustments__mono">{payment.id}</strong>
          </div>
          {originLabel ? (
            <div className="hub-pay-rev-form__fact">
              <span>Origem</span>
              <strong>
                <span className="hub-payables__chip">{originLabel}</span>
              </strong>
            </div>
          ) : null}
          {hasPartialReturn ? (
            <>
              <div className="hub-pay-rev-form__fact">
                <span>Lançamento</span>
                <strong>{formatBrl(Number(payment.amount))}</strong>
              </div>
              <div className="hub-pay-rev-form__fact">
                <span>Já devolvido</span>
                <strong className="hub-pay-rev-form__fact-value--muted">
                  −{formatBrl(alreadyRefundedAmount)}
                </strong>
              </div>
              <div className="hub-pay-rev-form__fact">
                <span>Vigente</span>
                <strong>{formatBrl(vigenteAmount)}</strong>
              </div>
              {selectedReturnAmount > 0.009 ? (
                <div className="hub-pay-rev-form__fact">
                  <span>A devolver agora</span>
                  <strong className="hub-pay-rev-form__fact-value--accent">
                    {formatBrl(selectedReturnAmount)}
                  </strong>
                </div>
              ) : null}
            </>
          ) : (
            <div className="hub-pay-rev-form__fact">
              <span>Valor</span>
              <strong>
                {selectedReturnAmount > 0.009
                  ? formatBrl(selectedReturnAmount)
                  : formatBrl(Number(payment.amount))}
              </strong>
              {selectedReturnAmount > 0.009 ? (
                <em className="hub-pay-rev-form__fact-hint">
                  dos {formatBrl(Number(payment.amount))} do lançamento
                </em>
              ) : null}
            </div>
          )}
          <div className="hub-pay-rev-form__fact">
            <span>Forma</span>
            <strong>
              {paymentMethodLabel(payment.payment_method)}
              {Number(payment.installments ?? 1) > 1 ? ` · ${payment.installments}x` : ''}
            </strong>
          </div>
          <div className="hub-pay-rev-form__fact">
            <span>Data</span>
            <strong>{formatPaymentDate(payment.payment_date)}</strong>
          </div>
        </div>
      ) : (
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-payment`}>
            Código do pagamento
          </label>
          <input
            id={`${idPrefix}-payment`}
            className="hub-clientes__input"
            value={manualDraft}
            onChange={(e) => setManualDraft(e.target.value)}
            placeholder="Cole o código completo"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {cashClosed ? (
        <p className="hub-adjustments__warning" role="status">
          Este dinheiro entrou em um caixa que já foi fechado. O snapshot da sessão permanece; o impacto fica em
          ajustes pós-fechamento.
        </p>
      ) : null}

      <div className="hub-pay-rev-form__section" role="group" aria-label="Tipo de operação">
        <span className="hub-clientes__label">Tipo de estorno</span>
        <div className="hub-pay-rev-form__mode-grid">
          <button
            type="button"
            className={`hub-pay-rev-form__mode${
              reversalMode === 'payment_reversal' ? ' hub-pay-rev-form__mode--active' : ''
            }`}
            onClick={() => selectMode('payment_reversal')}
          >
            <strong>Anular lançamento</strong>
            <span>Corrige duplicidade, método ou valor errado. Não devolve dinheiro nem estoque.</span>
          </button>
          <button
            type="button"
            className={`hub-pay-rev-form__mode${
              reversalMode === 'refund' ? ' hub-pay-rev-form__mode--active' : ''
            }`}
            onClick={() => selectMode('refund')}
          >
            <strong>Reembolso efetivo</strong>
            <span>
              {hasPhysicalProducts
                ? 'Se marcar itens, registra devolução só desses produtos (parcial) — não anula o pagamento inteiro. Sem itens, reembolsa o lançamento completo.'
                : 'Devolve o valor ao cliente (Pix, dinheiro, crédito etc.).'}
            </span>
          </button>
        </div>
      </div>

      {reversalMode === 'refund' ? (
        <div className="hub-pay-rev-form__section hub-pay-rev-form__section--refund">
          <div className="hub-pay-rev-form__refund-fields">
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor={`${idPrefix}-refund-method`}>
                Forma do reembolso
              </label>
              <HubSearchableCombobox
                id={`${idPrefix}-refund-method`}
                className="hub-combobox--clientes"
                options={methodOptions}
                value={refundMethod}
                disabled={saving}
                clearable={false}
                allowCreate={false}
                placeholder="Selecionar forma"
                searchPlaceholder="Buscar…"
                ariaLabel="Forma do reembolso"
                onChange={(v) => {
                  if (v) setRefundMethod(v);
                }}
              />
              {!allowCustomerCreditRefund ? (
                <p className="hub-clientes__muted" style={{ margin: '6px 0 0' }}>
                  Sem tutor nesta cobrança — crédito do tutor não está disponível.
                </p>
              ) : null}
            </div>
            <HubDateField
              id={`${idPrefix}-refund-date`}
              label="Data efetiva do reembolso"
              valueIso={refundDate}
              onChangeIso={setRefundDate}
            />
          </div>
        </div>
      ) : null}

      {loadingMerchandise ? (
        <HubLoading variant="block" label="Carregando produtos da venda…" />
      ) : null}

      {!loadingMerchandise && hasPhysicalProducts ? (
        <div className="hub-pay-rev-form__section">
          <div className="hub-pay-rev-form__merch-head">
            <span className="hub-clientes__label">Devolução de produto</span>
            <ReceivableStockReturnBadge status={stockReturnStatus} />
          </div>
          {allMerchandiseReturned ? (
            <p className="hub-pay-rev-form__locked" role="status">
              Produto(s) já devolvido(s) neste recebível. Não é possível registrar a mesma devolução de novo
              neste estorno nem em outro lugar.
            </p>
          ) : reversalMode === 'payment_reversal' ? (
            <div className="hub-pay-rev-form__hint" role="status">
              <strong>Anular não devolve estoque.</strong> Esta venda tem produto físico. Se o cliente
              devolveu a mercadoria, use{' '}
              <button type="button" className="hub-clientes__link-btn" onClick={() => selectMode('refund')}>
                Reembolso efetivo
              </button>{' '}
              e confirme a devolução abaixo — senão o produto fica sem reentrada e bloqueia devolução
              duplicada em outros lugares.
            </div>
          ) : (
            <HubMerchandiseReturnSection
              idPrefix={`${idPrefix}-stock`}
              lines={merchandiseLines}
              value={merchandiseReturn}
              onChange={setMerchandiseReturn}
              disabled={saving}
            />
          )}
        </div>
      ) : null}

      {!loadingMerchandise && !hasPhysicalProducts && payment ? (
        <p className="hub-pay-rev-form__hint hub-pay-rev-form__hint--muted">
          Sem produtos físicos nesta cobrança — só o estorno financeiro.
        </p>
      ) : null}

      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={`${idPrefix}-reason`}>
          Motivo
        </label>
        <textarea
          id={`${idPrefix}-reason`}
          className="hub-clientes__input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreva o motivo (mín. 3 caracteres)"
        />
      </div>

      <div className="hub-finance-page__drawer-footer hub-pay-rev-form__footer">
        <HubCancelButton onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </HubCancelButton>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary"
          disabled={saving || reason.trim().length < 3}
          onClick={() => void onConfirm()}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

export default HubPaymentReversalForm;
