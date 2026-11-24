import React from 'react';
import { PackageCheck, PackageX, RotateCcw } from 'lucide-react';
import { HubCheckbox } from '../../components/HubCheckbox';
import type { HubFinanceReceivableDetail } from '../../api/hubFinancialApi';

export type MerchandiseReturnLine = {
  id: string;
  description: string;
  quantity: number;
  lineTotal?: number;
  alreadyReturned?: boolean;
  returnedCondition?: 'sellable' | 'unsellable' | null;
};

/** Monta linhas de produto elegíveis a devolução a partir do detalhe do recebível. */
export function merchandiseLinesFromReceivableDetail(
  detail: Pick<HubFinanceReceivableDetail, 'lines' | 'product_returns'> | null | undefined,
): MerchandiseReturnLine[] {
  const lines = detail?.lines ?? [];
  const returns = detail?.product_returns ?? [];
  const byLine = new Map(returns.map((r) => [r.receivable_line_id, r]));
  return lines
    .filter(
      (l) =>
        String(l.line_kind) === 'product' &&
        l.hub_inventory_item_id &&
        l.hub_inventory_lot_id &&
        Number(l.quantity ?? 0) > 0,
    )
    .map((l) => {
      const prev = byLine.get(l.id);
      return {
        id: l.id,
        description: l.inventory_item?.name || l.description || 'Produto',
        quantity: Number(l.quantity ?? 0),
        lineTotal: Number(l.line_total ?? 0),
        alreadyReturned: Boolean(prev),
        returnedCondition: prev?.condition ?? null,
      };
    });
}

export type MerchandiseReturnValue = {
  returned: boolean;
  condition: 'sellable' | 'unsellable' | null;
  /** Produtos marcados para devolução (quantidade integral da linha). */
  selectedLineIds: string[];
};

export function pendingMerchandiseLineIds(lines: MerchandiseReturnLine[]): string[] {
  return lines.filter((l) => !l.alreadyReturned).map((l) => l.id);
}

export function emptyMerchandiseReturnValue(): MerchandiseReturnValue {
  return { returned: false, condition: null, selectedLineIds: [] };
}

/** Valor inicial do formulário avulso: itens desmarcados — operador marca só o que devolve. */
export function assumedMerchandiseReturnValue(_lines?: MerchandiseReturnLine[]): MerchandiseReturnValue {
  return {
    returned: true,
    condition: null,
    selectedLineIds: [],
  };
}

type Props = {
  lines: MerchandiseReturnLine[];
  value: MerchandiseReturnValue;
  onChange: (next: MerchandiseReturnValue) => void;
  disabled?: boolean;
  idPrefix?: string;
  /**
   * `optional`: checkbox “foi devolvida” (estorno/cancelamento).
   * `assumed`: formulário já é a devolução — escolhe itens + condição.
   */
  confirmMode?: 'optional' | 'assumed';
  /** Exibe o cabeçalho interno (desligue se a seção pai já tem título). */
  showHeading?: boolean;
};

/**
 * Confirmação explícita de devolução física, com seleção por item.
 * Só deve ser renderizado quando houver linhas de produto.
 */
export function HubMerchandiseReturnSection({
  lines,
  value,
  onChange,
  disabled = false,
  idPrefix = 'stock-return',
  confirmMode = 'optional',
  showHeading = true,
}: Props) {
  const allReturned = lines.length > 0 && lines.every((l) => l.alreadyReturned);
  const pending = lines.filter((l) => !l.alreadyReturned);
  const selectedSet = new Set(value.selectedLineIds);
  const selectedPending = pending.filter((l) => selectedSet.has(l.id));
  const allPendingSelected = pending.length > 0 && selectedPending.length === pending.length;
  const somePendingSelected = selectedPending.length > 0 && !allPendingSelected;

  const showPicker = !allReturned && (confirmMode === 'assumed' || value.returned);
  const showCondition = showPicker && selectedPending.length > 0;

  if (lines.length === 0) return null;

  const setSelectedIds = (ids: string[], returnedOverride?: boolean) => {
    onChange({
      returned: confirmMode === 'assumed' ? true : Boolean(returnedOverride),
      condition: ids.length === 0 ? null : value.condition,
      selectedLineIds: ids,
    });
  };

  const toggleLine = (lineId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...value.selectedLineIds, lineId])]
      : value.selectedLineIds.filter((id) => id !== lineId);
    setSelectedIds(next, confirmMode === 'optional' ? next.length > 0 : true);
  };

  const toggleAllPending = (checked: boolean) => {
    setSelectedIds(checked ? pending.map((l) => l.id) : [], confirmMode === 'optional' ? checked : true);
  };

  return (
    <div
      className={`hub-merch-return${disabled || allReturned ? ' hub-merch-return--disabled' : ''}`}
      role="group"
      aria-labelledby={showHeading ? `${idPrefix}-heading` : undefined}
      aria-label={showHeading ? undefined : 'Devolução de mercadorias'}
    >
      {showHeading ? (
        <div className="hub-merch-return__head">
          <span className="hub-merch-return__head-icon" aria-hidden>
            <RotateCcw size={16} strokeWidth={2} />
          </span>
          <div className="hub-merch-return__head-copy">
            <h4 id={`${idPrefix}-heading`} className="hub-merch-return__title">
              Devolução de mercadorias
            </h4>
            <p className="hub-merch-return__subtitle">
              {allReturned
                ? 'Já registrada para estes produtos.'
                : pending.length > 1
                  ? 'Marque só os itens que voltaram à loja — a devolução é da quantidade integral de cada item (não é possível devolver só parte da quantidade nesta versão).'
                  : 'A devolução é da quantidade integral do item. Confirme se a mercadoria voltou à loja e a condição para o estoque.'}
            </p>
          </div>
        </div>
      ) : null}

      {allReturned ? (
        <ul className="hub-merch-return__lines">
          {lines.map((line) => (
            <li key={line.id} className="hub-merch-return__line hub-merch-return__line--done">
              <span className="hub-merch-return__line-name">{line.description}</span>
              <span className="hub-merch-return__line-meta">
                qtd. {line.quantity}
                {line.returnedCondition === 'unsellable' ? ' · sem revenda' : ' · devolvida'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {allReturned ? (
        <p className="hub-merch-return__status" role="status">
          Devolução física já registrada. Nenhuma nova movimentação de estoque será feita.
        </p>
      ) : (
        <>
          {confirmMode === 'optional' ? (
            <div className="hub-merch-return__confirm">
              <HubCheckbox
                id={`${idPrefix}-returned`}
                checked={value.returned}
                disabled={disabled}
                onChange={(checked) => {
                  if (!checked) {
                    onChange({ returned: false, condition: null, selectedLineIds: [] });
                    return;
                  }
                  // Abre o seletor sem pré-marcar itens — escolha explícita do que volta.
                  onChange({
                    returned: true,
                    condition: null,
                    selectedLineIds: [],
                  });
                }}
              >
                A mercadoria foi devolvida à loja
              </HubCheckbox>
              {!value.returned ? (
                <p className="hub-merch-return__hint">
                  Estorno ou cancelamento financeiro não presume devolução física.
                </p>
              ) : null}
            </div>
          ) : null}

          {showPicker ? (
            <div className="hub-merch-return__picker">
              {pending.length > 1 ? (
                <div className="hub-merch-return__picker-all">
                  <HubCheckbox
                    id={`${idPrefix}-all`}
                    checked={allPendingSelected}
                    indeterminate={somePendingSelected}
                    disabled={disabled}
                    onChange={toggleAllPending}
                  >
                    Todos os itens pendentes
                  </HubCheckbox>
                </div>
              ) : null}
              <ul className="hub-merch-return__lines hub-merch-return__lines--selectable">
                {lines.map((line) => {
                  if (line.alreadyReturned) {
                    return (
                      <li key={line.id} className="hub-merch-return__line hub-merch-return__line--done">
                        <span className="hub-merch-return__line-name">{line.description}</span>
                        <span className="hub-merch-return__line-meta">
                          qtd. {line.quantity}
                          {line.returnedCondition === 'unsellable' ? ' · sem revenda' : ' · devolvida'}
                        </span>
                      </li>
                    );
                  }
                  const checked = selectedSet.has(line.id);
                  return (
                    <li
                      key={line.id}
                      className={`hub-merch-return__line hub-merch-return__line--selectable${
                        checked ? ' hub-merch-return__line--selected' : ''
                      }`}
                    >
                      <HubCheckbox
                        id={`${idPrefix}-line-${line.id}`}
                        checked={checked}
                        disabled={disabled}
                        onChange={(next) => toggleLine(line.id, next)}
                      >
                        <span className="hub-merch-return__line-check-body">
                          <span className="hub-merch-return__line-name">{line.description}</span>
                          <span className="hub-merch-return__line-meta">qtd. {line.quantity}</span>
                        </span>
                      </HubCheckbox>
                    </li>
                  );
                })}
              </ul>
              {selectedPending.length === 0 ? (
                <p className="hub-merch-return__hint">Selecione ao menos um item para devolver.</p>
              ) : pending.length > 1 && selectedPending.length < pending.length ? (
                <p className="hub-merch-return__hint">
                  {selectedPending.length} de {pending.length} itens — o restante permanece na venda.
                </p>
              ) : null}
            </div>
          ) : null}

          {showCondition ? (
            <div
              className="hub-merch-return__conditions"
              role="radiogroup"
              aria-label="Condição da mercadoria"
            >
              <p className="hub-merch-return__conditions-label">
                Condição
                <span className="hub-merch-return__conditions-count">
                  {selectedPending.length} produto{selectedPending.length === 1 ? '' : 's'} · quantidade
                  integral
                </span>
              </p>
              <div className="hub-merch-return__condition-grid">
                <button
                  type="button"
                  role="radio"
                  aria-checked={value.condition === 'sellable'}
                  disabled={disabled}
                  className={`hub-merch-return__condition${
                    value.condition === 'sellable' ? ' hub-merch-return__condition--selected' : ''
                  }`}
                  onClick={() =>
                    onChange({
                      returned: true,
                      condition: 'sellable',
                      selectedLineIds: value.selectedLineIds,
                    })
                  }
                >
                  <span className="hub-merch-return__condition-radio" aria-hidden />
                  <PackageCheck size={18} strokeWidth={2} className="hub-merch-return__condition-icon" aria-hidden />
                  <span className="hub-merch-return__condition-text">
                    <span className="hub-merch-return__condition-title">Apta para revenda</span>
                    <span className="hub-merch-return__condition-desc">
                      Retorna ao estoque disponível
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={value.condition === 'unsellable'}
                  disabled={disabled}
                  className={`hub-merch-return__condition${
                    value.condition === 'unsellable' ? ' hub-merch-return__condition--selected' : ''
                  }`}
                  onClick={() =>
                    onChange({
                      returned: true,
                      condition: 'unsellable',
                      selectedLineIds: value.selectedLineIds,
                    })
                  }
                >
                  <span className="hub-merch-return__condition-radio" aria-hidden />
                  <PackageX size={18} strokeWidth={2} className="hub-merch-return__condition-icon" aria-hidden />
                  <span className="hub-merch-return__condition-text">
                    <span className="hub-merch-return__condition-title">Não apta para revenda</span>
                    <span className="hub-merch-return__condition-desc">
                      Registra a saída sem voltar ao disponível
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function merchandiseReturnApiFields(value: MerchandiseReturnValue): {
  confirm_stock_return?: boolean;
  stock_return_condition?: 'sellable' | 'unsellable';
  stock_return_lines?: Array<{ line_id: string }>;
} {
  if (!value.returned || !value.condition || value.selectedLineIds.length === 0) return {};
  return {
    confirm_stock_return: true,
    stock_return_condition: value.condition,
    stock_return_lines: value.selectedLineIds.map((line_id) => ({ line_id })),
  };
}

export function selectedMerchandiseAmount(
  lines: MerchandiseReturnLine[],
  value: MerchandiseReturnValue,
): number {
  if (!value.returned || value.selectedLineIds.length === 0) return 0;
  const set = new Set(value.selectedLineIds);
  return lines
    .filter((l) => !l.alreadyReturned && set.has(l.id))
    .reduce((sum, l) => sum + Number(l.lineTotal ?? 0), 0);
}
