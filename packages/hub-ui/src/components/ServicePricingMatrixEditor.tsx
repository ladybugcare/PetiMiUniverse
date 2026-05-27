import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Cloud,
  Dog,
  Feather,
  HelpCircle,
  Layers,
  MoreHorizontal,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { CoatTypeValue, HubServicePricingMatrix, PorteValue } from '../utils/hubServiceTypesPricingMatrix';
import { COAT_TYPE_LABELS, PORTE_LABELS } from '../utils/hubServiceTypesPricingMatrix';

type Props = {
  serviceGroup: string;
  matrix: HubServicePricingMatrix;
  onChange: (next: HubServicePricingMatrix) => void;
  formatMoneyNumber: (n: number) => string;
  parseMoney: (raw: string) => number | null;
};

/** Tabela de matriz com o mesmo «chrome» visual (Banho & Tosa, Hotel, Creche, …). */
const MATRIX_TABLE_UNIFIED = 'hub-clientes__table hub-servicos__matrix-table hub-servicos__matrix-table--unified';

const PERIOD_LABEL: Record<'full_day' | 'half_day', string> = {
  full_day: 'Dia completo',
  half_day: 'Meio dia',
};

const CONSULT_LABEL: Record<'padrao' | 'retorno', string> = {
  padrao: 'Consulta padrão',
  retorno: 'Consulta de retorno',
};

const COAT_LUCIDE: Record<CoatTypeValue, LucideIcon> = {
  curto: Scissors,
  medio: Cloud,
  longo: Feather,
  duplo: Layers,
  encaracolado: Sparkles,
  sem_pelo: HelpCircle,
  outro: MoreHorizontal,
};

function CoatLabelWithIcon({ coat }: { coat: CoatTypeValue }) {
  const Icon = COAT_LUCIDE[coat];
  return (
    <span className="hub-servicos__matrix-coat-row">
      <span className="hub-servicos__matrix-coat-icon" aria-hidden>
        <Icon size={17} strokeWidth={1.85} />
      </span>
      <span>{COAT_TYPE_LABELS[coat]}</span>
    </span>
  );
}

type PortePelagemTier = Extract<HubServicePricingMatrix, { kind: 'porte_pelagem' }>['tiers'][number];

function groupPortePelagemRows(tiers: PortePelagemTier[]): { porte: PorteValue; items: Array<{ row: PortePelagemTier; idx: number }> }[] {
  const groups: { porte: PorteValue; items: Array<{ row: PortePelagemTier; idx: number }> }[] = [];
  tiers.forEach((row, idx) => {
    const last = groups[groups.length - 1];
    if (!last || last.porte !== row.porte) {
      groups.push({ porte: row.porte, items: [{ row, idx }] });
    } else {
      last.items.push({ row, idx });
    }
  });
  return groups;
}

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
      className="hub-clientes__input hub-servicos__matrix-money-input"
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
    const isBanho = serviceGroup === 'banho_tosa';
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className={MATRIX_TABLE_UNIFIED}>
          <thead>
            <tr>
              <th>Porte</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
              {isBanho ? <th className="hub-clientes__th-actions" aria-label="Ações" /> : null}
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={row.porte}>
                <td>
                  <span className="hub-servicos__matrix-porte-label">
                    <Dog size={18} strokeWidth={1.75} className="hub-servicos__matrix-porte-label-icon" aria-hidden />
                    {PORTE_LABELS[row.porte]}
                  </span>
                </td>
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
                {isBanho ? (
                  <td className="hub-clientes__td-actions">
                    <button
                      type="button"
                      className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                      title="Remover linha"
                      disabled={matrix.tiers.length <= 1}
                      aria-label="Remover linha de porte"
                      onClick={() => {
                        const tiers = matrix.tiers.filter((_, i) => i !== idx);
                        onChange({ kind: 'porte', tiers });
                      }}
                    >
                      <Trash2 size={18} strokeWidth={2} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'pelagem' && serviceGroup === 'banho_tosa') {
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className={MATRIX_TABLE_UNIFIED}>
          <thead>
            <tr>
              <th>Pelagem</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
              <th className="hub-clientes__th-actions" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {matrix.tiers.map((row, idx) => (
              <tr key={row.coat_type}>
                <td>
                  <CoatLabelWithIcon coat={row.coat_type} />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    id={`pm-coat-cost-${idx}`}
                    value={row.cost_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(cost_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, cost_amount } : t));
                      onChange({ kind: 'pelagem', tiers });
                    }}
                  />
                </td>
                <td className="hub-servicos__td-money">
                  <MoneyCell
                    id={`pm-coat-sale-${idx}`}
                    value={row.sale_amount}
                    formatMoneyNumber={formatMoneyNumber}
                    parseMoney={parseMoney}
                    onCommit={(sale_amount) => {
                      const tiers = matrix.tiers.map((t, i) => (i === idx ? { ...t, sale_amount } : t));
                      onChange({ kind: 'pelagem', tiers });
                    }}
                  />
                </td>
                <td className="hub-clientes__td-actions">
                  <button
                    type="button"
                    className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                    title="Remover linha"
                    disabled={matrix.tiers.length <= 1}
                    aria-label="Remover linha de pelagem"
                    onClick={() => {
                      const tiers = matrix.tiers.filter((_, i) => i !== idx);
                      onChange({ kind: 'pelagem', tiers });
                    }}
                  >
                    <Trash2 size={18} strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'porte_pelagem' && serviceGroup === 'banho_tosa') {
    const groups = groupPortePelagemRows(matrix.tiers);
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className={`${MATRIX_TABLE_UNIFIED} hub-servicos__matrix-table--porte-pelagem`}>
          <thead>
            <tr>
              <th>Porte</th>
              <th>Pelagem</th>
              <th className="hub-servicos__td-money">Custo (R$)</th>
              <th className="hub-servicos__td-money">Venda (R$)</th>
              <th className="hub-clientes__th-actions" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g) =>
              g.items.map((item, j) => (
                <tr key={`pp-${item.row.porte}-${item.row.coat_type}-${item.idx}`}>
                  {j === 0 ? (
                    <td className="hub-servicos__matrix-porte-cell" rowSpan={g.items.length}>
                      <div className="hub-servicos__matrix-porte-cell-inner">
                        <Dog size={20} strokeWidth={1.75} className="hub-servicos__matrix-porte-label-icon" aria-hidden />
                        <span className="hub-servicos__matrix-porte-title">{PORTE_LABELS[g.porte]}</span>
                      </div>
                    </td>
                  ) : null}
                  <td>
                    <CoatLabelWithIcon coat={item.row.coat_type} />
                  </td>
                  <td className="hub-servicos__td-money">
                    <MoneyCell
                      id={`pm-porte-coat-cost-${item.idx}`}
                      value={item.row.cost_amount}
                      formatMoneyNumber={formatMoneyNumber}
                      parseMoney={parseMoney}
                      onCommit={(cost_amount) => {
                        const tiers = matrix.tiers.map((t, i) => (i === item.idx ? { ...t, cost_amount } : t));
                        onChange({ kind: 'porte_pelagem', tiers });
                      }}
                    />
                  </td>
                  <td className="hub-servicos__td-money">
                    <MoneyCell
                      id={`pm-porte-coat-sale-${item.idx}`}
                      value={item.row.sale_amount}
                      formatMoneyNumber={formatMoneyNumber}
                      parseMoney={parseMoney}
                      onCommit={(sale_amount) => {
                        const tiers = matrix.tiers.map((t, i) => (i === item.idx ? { ...t, sale_amount } : t));
                        onChange({ kind: 'porte_pelagem', tiers });
                      }}
                    />
                  </td>
                  <td className="hub-clientes__td-actions">
                    <button
                      type="button"
                      className="hub-servicos__icon-btn hub-servicos__icon-btn--danger"
                      title="Remover linha"
                      disabled={matrix.tiers.length <= 1}
                      aria-label="Remover combinação porte e pelagem"
                      onClick={() => {
                        const tiers = matrix.tiers.filter((_, i) => i !== item.idx);
                        onChange({ kind: 'porte_pelagem', tiers });
                      }}
                    >
                      <Trash2 size={18} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  if (matrix.kind === 'periodo' && serviceGroup === 'creche') {
    return (
      <div className="hub-servicos__matrix-wrap">
        <table className={MATRIX_TABLE_UNIFIED}>
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
                <td>
                  <span className="hub-servicos__matrix-dim-label">{PERIOD_LABEL[row.period]}</span>
                </td>
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
        <table className={MATRIX_TABLE_UNIFIED}>
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
                <td>
                  <span className="hub-servicos__matrix-dim-label">{CONSULT_LABEL[row.consult_type]}</span>
                </td>
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
        <table className={MATRIX_TABLE_UNIFIED}>
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
              <tr key={`km-banda-tier-${idx}`}>
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
