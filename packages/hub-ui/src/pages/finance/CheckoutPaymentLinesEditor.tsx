import { Plus, Trash2 } from 'lucide-react';
import type { HubPaymentMethod } from '../../api/hubFinancialApi';
import {
  HubSearchableCombobox,
  type HubComboboxOption,
} from '../../components/HubSearchableCombobox';
import {
  emptyCardMachineFees,
  previewCardFee,
  type CardMachineFees,
} from '../../utils/hubCardMachineFees';
import {
  HUB_PAYMENT_METHOD_LABELS,
} from '../../utils/hubPaymentMethods';

export type CheckoutPaymentLine = {
  id: string;
  method: HubPaymentMethod;
  amountStr: string;
  tenderedStr: string;
  /** Parcelas (crédito). Débito e demais métodos usam 1. */
  installments: number;
};

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function parseAmount(raw: string): number {
  const t = String(raw).trim().replace(/\./g, '').replace(',', '.');
  return Number(t);
}

export function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function newPaymentLineId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDefaultPaymentLine(
  method: HubPaymentMethod,
  amount: number,
): CheckoutPaymentLine {
  return {
    id: newPaymentLineId(),
    method,
    amountStr: amount > 0 ? amount.toFixed(2).replace('.', ',') : '',
    tenderedStr: '',
    installments: 1,
  };
}

export function sumPaymentLines(lines: CheckoutPaymentLine[]): number {
  return round2(
    lines.reduce((s, line) => {
      const n = parseAmount(line.amountStr);
      return s + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0),
  );
}

export function totalChangeDue(lines: CheckoutPaymentLine[]): number {
  return round2(
    lines.reduce((s, line) => {
      if (line.method !== 'cash') return s;
      const amount = parseAmount(line.amountStr);
      const tendered = parseAmount(line.tenderedStr);
      if (!(amount > 0) || !(tendered > 0)) return s;
      return s + Math.max(0, tendered - amount);
    }, 0),
  );
}

export function totalCardFeeEstimate(
  lines: CheckoutPaymentLine[],
  fees: CardMachineFees,
): number {
  return round2(
    lines.reduce((s, line) => {
      const amount = parseAmount(line.amountStr);
      if (!(amount > 0)) return s;
      const installments = line.method === 'debit_card' ? 1 : line.installments || 1;
      const preview = previewCardFee(fees, line.method, amount, installments);
      return s + (preview?.fee_amount ?? 0);
    }, 0),
  );
}

const CREDIT_INSTALLMENT_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 1);

type Props = {
  due: number;
  lines: CheckoutPaymentLine[];
  onChange: (lines: CheckoutPaymentLine[]) => void;
  acceptedMethods: HubPaymentMethod[];
  cashSessionOpen: boolean;
  /** Quando false, só permite uma linha (ex.: agrupamento by_pet sem parcial). */
  allowMultiple?: boolean;
  disabled?: boolean;
  cardMachineFees?: CardMachineFees;
};

export function CheckoutPaymentLinesEditor({
  due,
  lines,
  onChange,
  acceptedMethods,
  cashSessionOpen,
  allowMultiple = true,
  disabled = false,
  cardMachineFees,
}: Props) {
  const fees = cardMachineFees ?? emptyCardMachineFees();
  const distributed = sumPaymentLines(lines);
  const remaining = round2(Math.max(0, due - distributed));
  const excess = round2(Math.max(0, distributed - due));
  const change = totalChangeDue(lines);
  const feeTotal = totalCardFeeEstimate(lines, fees);
  const methods = acceptedMethods.length ? acceptedMethods : (['pix'] as HubPaymentMethod[]);
  const methodOptions: HubComboboxOption[] = methods.map((m) => ({
    value: m,
    label: HUB_PAYMENT_METHOD_LABELS[m] ?? m,
  }));
  const installmentOptions: HubComboboxOption[] = CREDIT_INSTALLMENT_OPTIONS.map((n) => ({
    value: String(n),
    label: `${n}x`,
  }));

  const updateLine = (id: string, patch: Partial<CheckoutPaymentLine>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    const method = methods.includes('pix') ? 'pix' : methods[0];
    onChange([...lines, createDefaultPaymentLine(method, remaining > 0 ? remaining : 0)]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((l) => l.id !== id));
  };

  return (
    <div className="hub-checkout-payment-lines">
      <div className="hub-checkout-payment-lines__totals" aria-live="polite">
        <div>
          <span className="ui-label">Total</span>
          <strong>{formatBrl(due)}</strong>
        </div>
        <div>
          <span className="ui-label">Distribuído</span>
          <strong className={excess > 0.009 ? 'hub-checkout-payment-lines__remaining' : undefined}>
            {formatBrl(distributed)}
          </strong>
        </div>
        {excess > 0.009 ? (
          <div>
            <span className="ui-label">Excesso</span>
            <strong className="hub-checkout-payment-lines__remaining">{formatBrl(excess)}</strong>
          </div>
        ) : (
          <div>
            <span className="ui-label">Restante</span>
            <strong className={remaining > 0.009 ? 'hub-checkout-payment-lines__remaining' : undefined}>
              {formatBrl(remaining)}
            </strong>
          </div>
        )}
        {change > 0.009 ? (
          <div>
            <span className="ui-label">Troco</span>
            <strong>{formatBrl(change)}</strong>
          </div>
        ) : null}
        {feeTotal > 0.009 ? (
          <div>
            <span className="ui-label">Taxa maq.</span>
            <strong>{formatBrl(feeTotal)}</strong>
          </div>
        ) : null}
      </div>

      <ul className="hub-checkout-payment-lines__list">
        {lines.map((line, idx) => {
          const amount = parseAmount(line.amountStr);
          const installments = line.method === 'debit_card' ? 1 : line.installments || 1;
          const feePreview =
            Number.isFinite(amount) && amount > 0
              ? previewCardFee(fees, line.method, amount, installments)
              : null;

          return (
            <li key={line.id} className="hub-checkout-payment-lines__row">
              <div className="hub-clientes__field">
                <label className="ui-label" htmlFor={`checkout-pay-method-${line.id}`}>
                  Forma {lines.length > 1 ? idx + 1 : ''}
                </label>
                <HubSearchableCombobox
                  id={`checkout-pay-method-${line.id}`}
                  className="hub-combobox--clientes"
                  options={methodOptions}
                  value={line.method}
                  disabled={disabled}
                  clearable={false}
                  allowCreate={false}
                  placeholder="Selecionar forma"
                  searchPlaceholder="Buscar…"
                  ariaLabel={`Forma de pagamento${lines.length > 1 ? ` ${idx + 1}` : ''}`}
                  onChange={(v) => {
                    if (!v) return;
                    const method = v as HubPaymentMethod;
                    updateLine(line.id, {
                      method,
                      tenderedStr: method === 'cash' ? line.tenderedStr : '',
                      installments: method === 'credit_card' ? line.installments || 1 : 1,
                    });
                  }}
                />
              </div>
              <label className="hub-clientes__field">
                <span className="ui-label">Valor</span>
                <input
                  className="hub-clientes__input"
                  inputMode="decimal"
                  value={line.amountStr}
                  disabled={disabled}
                  onChange={(e) => updateLine(line.id, { amountStr: e.target.value })}
                  placeholder="0,00"
                />
              </label>
              {line.method === 'credit_card' ? (
                <div className="hub-clientes__field">
                  <label className="ui-label" htmlFor={`checkout-pay-installments-${line.id}`}>
                    Parcelas
                  </label>
                  <HubSearchableCombobox
                    id={`checkout-pay-installments-${line.id}`}
                    className="hub-combobox--clientes"
                    options={installmentOptions}
                    value={String(line.installments || 1)}
                    disabled={disabled}
                    clearable={false}
                    allowCreate={false}
                    placeholder="Parcelas"
                    searchPlaceholder="Buscar…"
                    ariaLabel={`Parcelas${lines.length > 1 ? ` da forma ${idx + 1}` : ''}`}
                    onChange={(v) =>
                      updateLine(line.id, { installments: Number(v) || 1 })
                    }
                  />
                </div>
              ) : line.method === 'cash' ? (
                <label className="hub-clientes__field">
                  <span className="ui-label">Recebido</span>
                  <input
                    className="hub-clientes__input"
                    inputMode="decimal"
                    value={line.tenderedStr}
                    disabled={disabled}
                    onChange={(e) => updateLine(line.id, { tenderedStr: e.target.value })}
                    placeholder="opcional"
                  />
                </label>
              ) : (
                <div className="hub-checkout-payment-lines__spacer" />
              )}
              {allowMultiple && lines.length > 1 ? (
                <button
                  type="button"
                  className="hub-btn hub-btn--ghost hub-btn--icon"
                  aria-label="Remover forma de pagamento"
                  disabled={disabled}
                  onClick={() => removeLine(line.id)}
                >
                  <Trash2 size={16} />
                </button>
              ) : (
                <span className="hub-checkout-payment-lines__spacer" />
              )}
              {line.method === 'cash' && !cashSessionOpen ? (
                <p className="hub-checkout-payment-lines__hint hub-checkout-payment-lines__hint--warn">
                  Abra o caixa nesta unidade para receber em dinheiro.
                </p>
              ) : null}
              {line.method === 'cash' && line.tenderedStr.trim() ? (
                <p className="hub-checkout-payment-lines__hint">
                  Troco desta linha:{' '}
                  {formatBrl(
                    Math.max(0, round2(parseAmount(line.tenderedStr) - parseAmount(line.amountStr))),
                  )}
                </p>
              ) : null}
              {feePreview ? (
                <p className="hub-checkout-payment-lines__hint">
                  Taxa maq. {String(feePreview.rate_percent).replace('.', ',')}% · líquido{' '}
                  {formatBrl(feePreview.net_amount)} (perde {formatBrl(feePreview.fee_amount)})
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {allowMultiple && remaining > 0.009 ? (
        <button type="button" className="hub-btn hub-btn--ghost" disabled={disabled} onClick={addLine}>
          <Plus size={16} /> Adicionar forma de pagamento
        </button>
      ) : null}
    </div>
  );
}
