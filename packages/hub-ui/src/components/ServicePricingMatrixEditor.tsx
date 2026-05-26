import React from 'react';
import type { HubServicePricingMatrix } from '../utils/hubServiceTypesPricingMatrix';
import { PORTE_LABELS } from '../utils/hubServiceTypesPricingMatrix';

type Props = {
  serviceGroup: string;
  matrix: HubServicePricingMatrix;
  onChange: (next: HubServicePricingMatrix) => void;
  formatMoneyNumber: (n: number) => string;
  parseMoney: (raw: string) => number | null;
};

const PERIOD_LABEL: Record<'full_day' | 'half_day', string> = {
  full_day: 'Dia completo',
  half_day: 'Meio dia',
};

const CONSULT_LABEL: Record<'padrao' | 'retorno', string> = {
  padrao: 'Consulta padrão',
  retorno: 'Consulta de retorno',
};

function MoneyCell(props: {
  value: number;
  onCommit: (n: number) => void;
  formatMoneyNumber: (n: number) => string;
  parseMoney: (raw: string) => number | null;
  disabled?: boolean;
  id?: string;
}) {
  const [local, setLocal] = React.useState(() => props.formatMoneyNumber(props.value));
  React.useEffect(() => {
    setLocal(props.formatMoneyNumber(props.value));
  }, [props.value, props.formatMoneyNumber]);
  return (
    <input
      id={props.id}
      className="hub-clientes__input"
      inputMode="decimal"
      autoComplete="off"
      disabled={props.disabled}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = props.parseMoney(local);
        if (n != null) props.onCommit(n);
        else setLocal(props.formatMoneyNumber(props.value));
      }}
    />
  );
}

export const ServicePricingMatrixEditor: React.FC<Props> = ({
  serviceGroup,
  matrix,
  onChange,
  formatMoneyNumber,
  parseMoney,
}) => {
  if (matrix.kind === 'porte' && (serviceGroup === 'banho_tosa' || serviceGroup === 'hotel')) {
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className="hub-clientes__table hub-servicos__matrix-table">
          <thead>
            <tr>
              <th>Porte</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={row.porte}>
                <td>{PORTE_LABELS[row.porte]}</td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    id={`pm-porte-cost-${idx}`}
                    value={row.cost_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(cost_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, cost_amount } : t));
                      onChange({ kind: 'porte', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    id={`pm-porte-sale-${idx}`}
                    value={row.sale_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(sale_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, sale_amount } : t));
                      onChange({ kind: 'porte', tiers });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'periodo' && serviceGroup === 'creche') {
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className="hub-clientes__table hub-servicos__matrix-table">
          <thead>
            <tr>
              <th>Período</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={row.period}>
                <td>{PERIOD_LABEL[row.period]}</td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.cost_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(cost_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, cost_amount } : t));
                      onChange({ kind: 'periodo', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.sale_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(sale_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, sale_amount } : t));
                      onChange({ kind: 'periodo', tiers });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'consulta' && serviceGroup === 'clinica') {
    return (
      <div className="hub-servicos__matrix-wrap">
        <p className="hub-servicos__margin-info" style={{ marginTop: 0 }}>
          Consulta de retorno pode ter venda 0,00 (gratuita).
        </p>
        <table className="hub-clientes__table hub-servicos__matrix-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={row.consult_type}>
                <td>{CONSULT_LABEL[row.consult_type]}</td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.cost_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(cost_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, cost_amount } : t));
                      onChange({ kind: 'consulta', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.sale_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(sale_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, sale_amount } : t));
                      onChange({ kind: 'consulta', tiers });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'km_banda' && serviceGroup === 'leva_traz') {
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className="hub-clientes__table hub-servicos__matrix-table">
          <thead>
            <tr>
              <th>Descrição da faixa</th>
              <th>Km min (opc.)</th>
              <th>Km máx (opc.)</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
              <th className="hub-clientes__th-actions" />
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={`${row.label}-${idx}`}>
                <td>
                  <input
                    className="hub-clientes__input"
                    value={row.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, label } : t));
                      onChange({ kind: 'km_banda', tiers });
                    }}
                    placeholder="Ex.: 0–5 km"
                  />
                </td>
                <td>
                  <input
                    className="hub-clientes__input"
                    inputMode="numeric"
                    value={row.km_min ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const km_min = v === '' ? null : Number(v);
                      const tiers = matrix.tiers.map((t, i) =>
                        i === idx ? { ...t, km_min: Number.isFinite(km_min) ? km_min : t.km_min } : t
                      );
                      onChange({ kind: 'km_banda', tiers });
                    }}
                  />
                </td>
                <td>
                  <input
                    className="hub-clientes__input"
                    inputMode="numeric"
                    value={row.km_max ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      const km_max = v === '' ? null : Number(v);
                      const tiers = matrix.tiers.map((t, i) =>
                        i === idx ? { ...t, km_max: Number.isFinite(km_max) ? km_max : t.km_max } : t
                      );
                      onChange({ kind: 'km_banda', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.cost_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(cost_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, cost_amount } : t));
                      onChange({ kind: 'km_banda', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    value={row.sale_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(sale_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, sale_amount } : t));
                      onChange({ kind: 'km_banda', tiers });
                    }}
                  />
                </td>
                <td className="hub-clientes__td-actions">
                  <button
                    type="button"
                    className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                    title="Remover faixa"
                    disabled={matrix.tiers.length <= 1}
                    onClick={() => {
                      const tiers = matrix.tiers.filter((_, i) => i !== idx);
                      onChange({ kind: 'km_banda', tiers });
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            onChange({
              kind: 'km_banda',
              tiers: [
                ...matrix.tiers,
                { label: 'Nova faixa', km_min: null, km_max: null, cost_amount: 0, sale_amount: 0 },
              ],
            });
          }}
        >
          Adicionar faixa
        </button>
      </div>
    );
  }

  return (
    <p className="hub-clientes__muted">
      Matriz não aplicável a este grupo (recarregue ou altere o grupo).
    </p>
  );
};
