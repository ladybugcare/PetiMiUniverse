import React, { useMemo, useState } from 'react';
import { Minus, Package, Plus, Scissors, Trash2 } from 'lucide-react';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import type { HubInventoryItem, HubInventoryLotRow } from '../../api/hubInventoryApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import { computeLineTotal, parseMoney, type ComandaItemDraft } from './comandaItemDraft';
import { normalizeProductQtyInput } from './quickSaleQty';

type Props = {
  items: ComandaItemDraft[];
  serviceTypes: HubServiceType[];
  inventoryItems: HubInventoryItem[];
  inventoryLots: HubInventoryLotRow[];
  cartTotal: number;
  onAddProductById: (inventoryItemId: string) => void;
  onAddServiceById: (serviceTypeId: string) => void;
  onUpdateItem: (idx: number, patch: Partial<ComandaItemDraft>) => void;
  onRemoveItem: (idx: number) => void;
  onBumpQty: (idx: number, delta: number) => void;
};

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatUnitDisplay(raw: string): string {
  const n = parseMoney(raw);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const QuickSaleCart: React.FC<Props> = ({
  items,
  serviceTypes,
  inventoryItems,
  inventoryLots,
  cartTotal,
  onAddProductById,
  onAddServiceById,
  onUpdateItem,
  onRemoveItem,
  onBumpQty,
}) => {
  const [picker, setPicker] = useState<'product' | 'service' | null>(null);
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);

  const productOptions = useMemo((): HubComboboxOption[] => {
    return [
      { value: '', label: '— Buscar produto —' },
      ...inventoryItems.map((p) => {
        const qty = Number(p.qty_on_hand ?? 0);
        const code = p.store_sku || p.ean;
        return {
          value: p.id,
          label: code ? `${p.name} · ${code} · ${qty} un.` : `${p.name} · ${qty} un.`,
        };
      }),
    ];
  }, [inventoryItems]);

  const serviceOptions = useMemo((): HubComboboxOption[] => {
    const active = serviceTypes.filter((s) => !s.deleted_at && s.active !== false && !s.is_addon);
    return [
      { value: '', label: '— Buscar serviço —' },
      ...active.map((s) => ({
        value: s.id,
        label: s.name,
      })),
    ];
  }, [serviceTypes]);

  const lotsForItem = (itemId: string | null) =>
    itemId ? inventoryLots.filter((l) => l.item_id === itemId) : [];

  const lotOptions = (itemId: string | null): HubComboboxOption[] => {
    const lots = lotsForItem(itemId);
    return [
      { value: '', label: '— Escolher lote —' },
      ...lots.map((l) => ({
        value: l.id,
        label: `${l.lot_code || 'Sem código'} · ${Number(l.qty_on_hand ?? 0)} un.`,
      })),
    ];
  };

  const lotLabel = (lotId: string | null, itemId: string | null): string => {
    if (!lotId) return 'Sem lote selecionado';
    const lot = inventoryLots.find((l) => l.id === lotId && (!itemId || l.item_id === itemId));
    if (!lot) return 'Lote';
    return `${lot.lot_code || 'Sem código'} · ${Number(lot.qty_on_hand ?? 0)} un.`;
  };

  return (
    <div className="hub-quick-sale-cart">
      <div className="hub-quick-sale-cart__head">
        <h3 className="hub-quick-sale-cart__title">Carrinho</h3>
        <strong className="hub-quick-sale-cart__total">{formatBrl(cartTotal)}</strong>
      </div>

      {items.length === 0 ? (
        <div className="hub-quick-sale-cart__empty">
          <p className="hub-quick-sale-cart__empty-title">Nenhum item ainda</p>
          <p className="hub-quick-sale-cart__empty-hint">
            Passe o código de barras ou adicione um produto/serviço abaixo.
          </p>
        </div>
      ) : (
        <ul className="hub-quick-sale-cart__list">
          {items.map((it, idx) => {
            const inv = it.hub_inventory_item_id
              ? inventoryItems.find((p) => p.id === it.hub_inventory_item_id)
              : null;
            const priceLocked = Boolean(inv && !inv.allow_price_override_on_sale);
            const isProduct = it.item_kind === 'product';
            const itemLots = lotsForItem(it.hub_inventory_item_id);
            const lotMissing = isProduct && Boolean(it.hub_inventory_item_id) && !it.hub_inventory_lot_id;
            const needsLotPicker = isProduct && itemLots.length > 1;
            const lineTotal = computeLineTotal(it);
            const qty = parseMoney(it.quantity) || 1;
            const editingPrice = editingPriceIdx === idx && !priceLocked;
            const lotQty = it.hub_inventory_lot_id
              ? Number(
                  inventoryLots.find((l) => l.id === it.hub_inventory_lot_id)?.qty_on_hand ?? 0,
                )
              : 0;
            const atStockCap = isProduct && lotQty > 0 && qty >= lotQty;
            const overStock = isProduct && lotQty > 0 && qty > lotQty;
            const qtyNorm = isProduct
              ? normalizeProductQtyInput(it.quantity, lotQty > 0 ? lotQty : Number.POSITIVE_INFINITY, Boolean(inv?.allow_fractional))
              : null;
            const qtyInvalid = Boolean(qtyNorm?.invalid && String(it.quantity).trim());

            return (
              <li
                key={it.id ?? `line-${idx}`}
                className={
                  lotMissing || overStock
                    ? 'hub-quick-sale-cart__line hub-quick-sale-cart__line--warn'
                    : 'hub-quick-sale-cart__line'
                }
              >
                <div className="hub-quick-sale-cart__line-top">
                  <div className="hub-quick-sale-cart__line-identity">
                    <span
                      className={
                        isProduct
                          ? 'hub-quick-sale-cart__badge hub-quick-sale-cart__badge--product'
                          : 'hub-quick-sale-cart__badge hub-quick-sale-cart__badge--service'
                      }
                    >
                      {isProduct ? (
                        <Package size={12} strokeWidth={2.25} aria-hidden />
                      ) : (
                        <Scissors size={12} strokeWidth={2.25} aria-hidden />
                      )}
                      {isProduct ? 'Produto' : 'Serviço'}
                    </span>
                    <strong className="hub-quick-sale-cart__line-name">
                      {it.description.trim() || (isProduct ? 'Produto' : 'Serviço')}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="hub-quick-sale-cart__remove"
                    aria-label="Remover item"
                    onClick={() => onRemoveItem(idx)}
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </div>

                {isProduct ? (
                  <div className="hub-quick-sale-cart__lot-row">
                    <span className="hub-quick-sale-cart__field-label">Lote</span>
                    {needsLotPicker || lotMissing ? (
                      <div className="hub-quick-sale-cart__lot-picker">
                        <HubSearchableCombobox
                          id={`qs-lot-${idx}`}
                          className="hub-orcamento-novo__combobox"
                          options={lotOptions(it.hub_inventory_item_id)}
                          value={it.hub_inventory_lot_id ?? ''}
                          onChange={(v) => onUpdateItem(idx, { hub_inventory_lot_id: v || null })}
                          placeholder="Escolher lote"
                          searchPlaceholder="Buscar lote…"
                          ariaLabel="Lote"
                          disabled={!it.hub_inventory_item_id}
                        />
                        {lotMissing ? (
                          <span className="hub-quick-sale-cart__lot-warn">Obrigatório para baixar estoque</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="hub-quick-sale-cart__lot-static">
                        {lotLabel(it.hub_inventory_lot_id, it.hub_inventory_item_id)}
                      </span>
                    )}
                  </div>
                ) : null}

                <div className="hub-quick-sale-cart__line-footer">
                  <div className="hub-quick-sale-cart__field">
                    <span className="hub-quick-sale-cart__field-label">Qtd</span>
                    <div className="hub-quick-sale-cart__qty" role="group" aria-label="Quantidade">
                      <button
                        type="button"
                        className="hub-quick-sale-cart__qty-btn"
                        aria-label="Diminuir quantidade"
                        disabled={qty <= 1}
                        onClick={() => onBumpQty(idx, -1)}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <input
                        className={
                          qtyInvalid || overStock
                            ? 'hub-quick-sale-cart__qty-input hub-quick-sale-cart__qty-input--warn'
                            : 'hub-quick-sale-cart__qty-input'
                        }
                        value={it.quantity}
                        inputMode={inv?.allow_fractional ? 'decimal' : 'numeric'}
                        aria-label="Quantidade"
                        aria-invalid={qtyInvalid || overStock}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (isProduct && !inv?.allow_fractional) {
                            // Só dígitos (permite vazio enquanto edita).
                            if (raw !== '' && !/^\d+$/.test(raw.trim())) {
                              onUpdateItem(idx, { quantity: raw });
                              return;
                            }
                          }
                          onUpdateItem(idx, { quantity: raw });
                        }}
                        onBlur={() => {
                          if (!isProduct) return;
                          const norm = normalizeProductQtyInput(
                            it.quantity,
                            lotQty > 0 ? lotQty : Number.POSITIVE_INFINITY,
                            Boolean(inv?.allow_fractional),
                          );
                          if (norm.invalid) {
                            onUpdateItem(idx, { quantity: '1' });
                            return;
                          }
                          if (norm.quantity !== it.quantity) {
                            onUpdateItem(idx, { quantity: norm.quantity });
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="hub-quick-sale-cart__qty-btn"
                        aria-label="Aumentar quantidade"
                        disabled={atStockCap}
                        title={atStockCap ? `Máximo no lote: ${lotQty}` : undefined}
                        onClick={() => onBumpQty(idx, 1)}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                    {qtyInvalid ? (
                      <span className="hub-quick-sale-cart__lot-warn">
                        {inv?.allow_fractional
                          ? 'Quantidade inválida'
                          : 'Use um número inteiro'}
                      </span>
                    ) : overStock ? (
                      <span className="hub-quick-sale-cart__lot-warn">
                        Disponível no lote: {lotQty}
                      </span>
                    ) : null}
                  </div>

                  <div className="hub-quick-sale-cart__field hub-quick-sale-cart__field--price">
                    <span className="hub-quick-sale-cart__field-label">Preço unit.</span>
                    {editingPrice ? (
                      <div className="hub-quick-sale-cart__money">
                        <span className="hub-quick-sale-cart__money-prefix">R$</span>
                        <input
                          className="hub-quick-sale-cart__money-input"
                          value={it.unit_amount}
                          inputMode="decimal"
                          autoFocus
                          aria-label="Preço unitário"
                          onChange={(e) => onUpdateItem(idx, { unit_amount: e.target.value })}
                          onBlur={() => {
                            const n = parseMoney(it.unit_amount);
                            onUpdateItem(idx, { unit_amount: String(n) });
                            setEditingPriceIdx(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={
                          priceLocked
                            ? 'hub-quick-sale-cart__money-display hub-quick-sale-cart__money-display--locked'
                            : 'hub-quick-sale-cart__money-display'
                        }
                        disabled={priceLocked}
                        title={
                          priceLocked
                            ? 'Preço fixo no catálogo'
                            : 'Toque para alterar o preço unitário'
                        }
                        onClick={() => setEditingPriceIdx(idx)}
                      >
                        <span className="hub-quick-sale-cart__money-prefix">R$</span>
                        <span>{formatUnitDisplay(it.unit_amount)}</span>
                      </button>
                    )}
                  </div>

                  <div className="hub-quick-sale-cart__field hub-quick-sale-cart__field--total">
                    <span className="hub-quick-sale-cart__field-label">Total</span>
                    <strong className="hub-quick-sale-cart__line-total">{formatBrl(lineTotal)}</strong>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="hub-quick-sale-cart__actions">
        <button
          type="button"
          className={
            picker === 'product'
              ? 'hub-quick-sale-cart__action hub-quick-sale-cart__action--active'
              : 'hub-quick-sale-cart__action'
          }
          onClick={() => setPicker((p) => (p === 'product' ? null : 'product'))}
        >
          <Package size={15} strokeWidth={2.25} aria-hidden />
          + Produto
        </button>
        <button
          type="button"
          className={
            picker === 'service'
              ? 'hub-quick-sale-cart__action hub-quick-sale-cart__action--active'
              : 'hub-quick-sale-cart__action'
          }
          onClick={() => setPicker((p) => (p === 'service' ? null : 'service'))}
        >
          <Scissors size={15} strokeWidth={2.25} aria-hidden />
          + Serviço
        </button>
      </div>

      {picker === 'product' ? (
        <div className="hub-quick-sale-cart__picker">
          <HubSearchableCombobox
            id="qs-pick-product"
            className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
            options={productOptions}
            value=""
            onChange={(id) => {
              if (!id) return;
              onAddProductById(id);
              setPicker(null);
            }}
            placeholder="Buscar produto por nome, EAN ou SKU…"
            searchPlaceholder="Nome, EAN ou SKU…"
            ariaLabel="Adicionar produto"
          />
        </div>
      ) : null}

      {picker === 'service' ? (
        <div className="hub-quick-sale-cart__picker">
          <HubSearchableCombobox
            id="qs-pick-service"
            className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
            options={serviceOptions}
            value=""
            onChange={(id) => {
              if (!id) return;
              onAddServiceById(id);
              setPicker(null);
            }}
            placeholder="Buscar serviço…"
            searchPlaceholder="Nome do serviço…"
            ariaLabel="Adicionar serviço"
          />
        </div>
      ) : null}
    </div>
  );
};
