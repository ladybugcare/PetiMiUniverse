import React from 'react';

export type ReceivableCancelIntent = 'void_sale' | 'reissue_billing';

type Props = {
  idPrefix: string;
  value: ReceivableCancelIntent;
  onChange: (next: ReceivableCancelIntent) => void;
  disabled?: boolean;
};

/** Escolha entre anular a venda ou só corrigir a cobrança (reabrir itens). */
export function HubReceivableCancelIntentField({ idPrefix, value, onChange, disabled }: Props) {
  return (
    <fieldset className="hub-clientes__field" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="hub-clientes__label">O que deseja fazer?</legend>
      <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
        <label
          htmlFor={`${idPrefix}-void`}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer' }}
        >
          <input
            id={`${idPrefix}-void`}
            type="radio"
            name={`${idPrefix}-intent`}
            checked={value === 'void_sale'}
            disabled={disabled}
            onChange={() => onChange('void_sale')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Anular a venda</strong>
            <span className="hub-clientes__muted" style={{ display: 'block', fontSize: 13 }}>
              Cancela a cobrança e a comanda. Os itens não voltam a ser faturáveis.
            </span>
          </span>
        </label>
        <label
          htmlFor={`${idPrefix}-reissue`}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer' }}
        >
          <input
            id={`${idPrefix}-reissue`}
            type="radio"
            name={`${idPrefix}-intent`}
            checked={value === 'reissue_billing'}
            disabled={disabled}
            onChange={() => onChange('reissue_billing')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Corrigir cobrança</strong>
            <span className="hub-clientes__muted" style={{ display: 'block', fontSize: 13 }}>
              Remove só este recebível e reabre os itens para faturar de novo.
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
