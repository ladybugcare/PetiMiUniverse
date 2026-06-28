import React from 'react';
import { HubSearchableCombobox, type HubComboboxOption } from '../HubSearchableCombobox';

export type DiscountKind = 'percent' | 'fixed' | '';

const DISCOUNT_KIND_OPTIONS: HubComboboxOption[] = [
  { value: '', label: 'Sem desconto' },
  { value: 'percent', label: 'Percentual (%)' },
  { value: 'fixed', label: 'Valor fixo (R$)' },
];

export interface DiscountControlProps {
  kind: DiscountKind;
  valueStr: string;
  onKindChange: (k: DiscountKind) => void;
  onValueStrChange: (v: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}

/**
 * Controle reutilizável de desconto (tipo + valor).
 * Usa as mesmas classes CSS do módulo de orçamentos.
 * Funciona tanto em orçamentos quanto em comandas.
 */
export const DiscountControl: React.FC<DiscountControlProps> = ({
  kind,
  valueStr,
  onKindChange,
  onValueStrChange,
  disabled = false,
  idPrefix = 'discount',
}) => {
  return (
    <div className="hub-orcamento-novo__discount-fields">
      <div className="hub-orcamento-novo__field">
        <label className="hub-orcamento-novo__label" htmlFor={`${idPrefix}-kind`}>
          Tipo
        </label>
        <HubSearchableCombobox
          id={`${idPrefix}-kind`}
          className="hub-orcamento-novo__combobox"
          options={DISCOUNT_KIND_OPTIONS}
          value={kind}
          onChange={(v) => onKindChange((v || '') as DiscountKind)}
          placeholder="Sem desconto"
          searchPlaceholder="Buscar tipo…"
          clearable={false}
          ariaLabel="Tipo de desconto"
          disabled={disabled}
        />
      </div>
      <div className="hub-orcamento-novo__field">
        <label className="hub-orcamento-novo__label" htmlFor={`${idPrefix}-value`}>
          Valor
        </label>
        <input
          id={`${idPrefix}-value`}
          className="hub-orcamento-novo__input"
          value={valueStr}
          onChange={(e) => onValueStrChange(e.target.value)}
          disabled={disabled || !kind}
          placeholder={kind === 'percent' ? '0' : '0,00'}
        />
      </div>
    </div>
  );
};

/** Converte kind + valueStr + subtotal para o valor absoluto de desconto. */
export function resolveDiscountAmount(kind: DiscountKind, valueStr: string, subtotal: number): number {
  const dv = parseFloat(String(valueStr).trim().replace(',', '.'));
  const parsed = Number.isFinite(dv) ? dv : 0;
  if (kind === 'percent') {
    return Math.round(((subtotal * Math.min(100, Math.max(0, parsed))) / 100) * 100) / 100;
  }
  if (kind === 'fixed') {
    return Math.min(subtotal, Math.max(0, parsed));
  }
  return 0;
}

/** Infere kind + valueStr a partir de discount_amount e subtotal (para carregar valores salvos). */
export function inferDiscountKindAndValue(
  discountAmount: number,
  subtotal: number,
): { kind: DiscountKind; valueStr: string } {
  if (!discountAmount || discountAmount <= 0) return { kind: '', valueStr: '0' };
  if (subtotal > 0) {
    const pct = Math.round((discountAmount / subtotal) * 10000) / 100;
    if (Math.abs(resolveDiscountAmount('percent', String(pct), subtotal) - discountAmount) < 0.01) {
      return { kind: 'percent', valueStr: String(pct) };
    }
  }
  return { kind: 'fixed', valueStr: String(discountAmount) };
}
