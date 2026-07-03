import React, { forwardRef } from 'react';
import { Phone, User } from 'lucide-react';

export type CheckoutDrawerHeroProps = {
  guardianName: string;
  guardianPhone?: string | null;
  petNames?: string[];
  badges?: React.ReactNode;
};

export function CheckoutDrawerHero({
  guardianName,
  guardianPhone,
  petNames = [],
  badges,
}: CheckoutDrawerHeroProps) {
  return (
    <section className="hub-checkout-drawer__hero">
      <div className="hub-checkout-drawer__hero-main">
        <div className="hub-checkout-drawer__hero-row">
          <User size={16} aria-hidden />
          <strong>{guardianName || 'Tutor não informado'}</strong>
        </div>
        {guardianPhone ? (
          <div className="hub-checkout-drawer__hero-row hub-clientes__muted">
            <Phone size={14} aria-hidden />
            <span>{guardianPhone}</span>
          </div>
        ) : null}
        {petNames.length > 0 ? (
          <div className="hub-checkout-drawer__pet-chips">
            {petNames.map((name) => (
              <span key={name} className="hub-checkout-drawer__pet-chip">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {badges ? <div className="hub-checkout-drawer__hero-meta">{badges}</div> : null}
    </section>
  );
}

export type CheckoutDrawerSummaryCellProps = {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
};

export function CheckoutDrawerSummaryCell({ label, value, highlight = false }: CheckoutDrawerSummaryCellProps) {
  return (
    <div
      className={`hub-checkout-drawer__summary-cell${highlight ? ' hub-checkout-drawer__summary-cell--highlight' : ''}`}
    >
      <span className="hub-checkout-drawer__summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export type CheckoutDrawerSummaryGridProps = {
  children: React.ReactNode;
  columns?: 3 | 4;
};

export function CheckoutDrawerSummaryGrid({ children, columns = 3 }: CheckoutDrawerSummaryGridProps) {
  return (
    <section
      className={`hub-checkout-drawer__summary-grid${columns === 4 ? ' hub-checkout-drawer__summary-grid--quad' : ''}`}
    >
      {children}
    </section>
  );
}

export type CheckoutDrawerSectionProps = {
  title: string;
  hint?: string;
  children: React.ReactNode;
};

export function CheckoutDrawerSection({ title, hint, children }: CheckoutDrawerSectionProps) {
  return (
    <section className="hub-checkout-drawer__section">
      <h3 className="hub-checkout-drawer__section-title">{title}</h3>
      {hint ? <p className="hub-clientes__muted hub-checkout-drawer__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

export type CheckoutDrawerBillingAction = 'receive_now' | 'leave_pending' | 'cancel';

export type CheckoutDrawerActionTabsProps = {
  action: CheckoutDrawerBillingAction;
  onActionChange: (action: CheckoutDrawerBillingAction) => void;
  tabs: Array<{ value: CheckoutDrawerBillingAction; label: string }>;
};

export function CheckoutDrawerActionTabs({ action, onActionChange, tabs }: CheckoutDrawerActionTabsProps) {
  return (
    <div className="hub-checkout-drawer__action-tabs" role="tablist" aria-label="Ação de cobrança">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={action === value}
          className={`hub-checkout-drawer__action-tab${action === value ? ' hub-checkout-drawer__action-tab--active' : ''}`}
          onClick={() => onActionChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export type CheckoutDrawerBillingShellProps = {
  children: React.ReactNode;
  className?: string;
};

/** Agrupa abas de ação + painel (pagamento, cancelamento, etc.) com o mesmo espaçamento do Caixa. */
export const CheckoutDrawerBillingShell = forwardRef<HTMLDivElement, CheckoutDrawerBillingShellProps>(
  function CheckoutDrawerBillingShell({ children, className }, ref) {
    return (
      <div ref={ref} className={`hub-checkout-drawer__billing${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    );
  },
);

export type CheckoutDrawerCancelReasonFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function CheckoutDrawerCancelReasonField({ id, value, onChange }: CheckoutDrawerCancelReasonFieldProps) {
  return (
    <div className="hub-clientes__field">
      <label className="hub-clientes__label" htmlFor={id}>
        Motivo do cancelamento (obrigatório)
      </label>
      <textarea
        id={id}
        className="hub-clientes__input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Informe o motivo (mín. 3 caracteres)"
      />
    </div>
  );
}

export type CheckoutDrawerPaymentFieldsProps = {
  amountId: string;
  amountLabel: string;
  amount: string;
  onAmountChange: (value: string) => void;
  amountPlaceholder?: string;
  onFillTotal?: () => void;
  fillTotalLabel?: string;
  balanceHint?: string;
  methodId: string;
  methodLabel?: string;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  paymentMethodOptions: { value: string; label: string }[];
  methodHint?: React.ReactNode;
  notesId?: string;
  notesLabel?: string;
  notes?: string;
  onNotesChange?: (value: string) => void;
  notesPlaceholder?: string;
};

export function CheckoutDrawerPaymentFields({
  amountId,
  amountLabel,
  amount,
  onAmountChange,
  amountPlaceholder,
  onFillTotal,
  fillTotalLabel = 'Receber total',
  balanceHint,
  methodId,
  methodLabel = 'Forma de pagamento',
  paymentMethod,
  onPaymentMethodChange,
  paymentMethodOptions,
  methodHint,
  notesId,
  notesLabel = 'Observações',
  notes,
  onNotesChange,
  notesPlaceholder = 'Opcional',
}: CheckoutDrawerPaymentFieldsProps) {
  return (
    <section className="hub-checkout-drawer__payment-block">
      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={amountId}>
          {amountLabel}
        </label>
        <div className="hub-checkout-drawer__amount-row">
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            className="hub-clientes__input"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder={amountPlaceholder}
          />
          {onFillTotal ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm" onClick={onFillTotal}>
              {fillTotalLabel}
            </button>
          ) : null}
        </div>
        {balanceHint ? <p className="hub-clientes__muted">{balanceHint}</p> : null}
      </div>

      <div className="hub-clientes__field">
        <label className="hub-clientes__label" htmlFor={methodId}>
          {methodLabel}
        </label>
        <select
          id={methodId}
          className="hub-clientes__select-input"
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value)}
        >
          {paymentMethodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {methodHint}
      </div>

      {notesId && onNotesChange ? (
        <div className="hub-clientes__field">
          <label className="hub-clientes__label" htmlFor={notesId}>
            {notesLabel}
          </label>
          <input
            id={notesId}
            className="hub-clientes__input"
            value={notes ?? ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={notesPlaceholder}
          />
        </div>
      ) : null}
    </section>
  );
}
