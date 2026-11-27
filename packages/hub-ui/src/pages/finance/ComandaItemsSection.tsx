import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, Trash2 } from 'lucide-react';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import type { HubInventoryItem, HubInventoryLotRow } from '../../api/hubInventoryApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import type { HubComandaPendingPriceApproval } from '../../api/hubComandaApi';
import type { ComandaItemDraft } from './comandaItemDraft';
import { isLotExpired } from '../../utils/inventoryLotExpiry';

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isProductItem(it: ComandaItemDraft): boolean {
  return it.item_kind === 'product';
}

type PackageBalance = {
  id: string;
  sessions_remaining: number;
  hub_packages?: { name?: string } | { name?: string }[] | null;
};

type Props = {
  items: ComandaItemDraft[];
  canEdit: boolean;
  /** Exibe coluna/campo Pet nas linhas de serviço (comanda multipet). */
  showPetColumn?: boolean;
  catalogSearch: string;
  onCatalogSearchChange: (value: string) => void;
  serviceTypes: HubServiceType[];
  inventoryItems: HubInventoryItem[];
  inventoryLots: HubInventoryLotRow[];
  computeLineTotal: (d: ComandaItemDraft) => number;
  onAddService: () => void;
  onAddProduct: () => void;
  onUpdateItem: (idx: number, patch: Partial<ComandaItemDraft>) => void;
  onRemoveItem: (idx: number) => void;
  onApplyService: (idx: number, serviceTypeId: string) => void;
  onApplyProduct: (idx: number, inventoryItemId: string) => void;
  packageBalancesByItemId?: Record<string, PackageBalance[]>;
  onTogglePackage?: (itemId: string, balanceId: string | null) => void;
  pendingPriceApprovals?: HubComandaPendingPriceApproval[];
  canApprovePrices?: boolean;
  approvingPriceId?: string | null;
  onApprovePrice?: (item: HubComandaPendingPriceApproval) => void;
  emptyServicesLabel?: string;
  emptyProductsLabel?: string;
  productSearchHint?: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="hub-comanda-items__field-label">{children}</span>;
}

export const ComandaItemsSection: React.FC<Props> = ({
  items,
  canEdit,
  showPetColumn: showPetColumnProp,
  catalogSearch,
  onCatalogSearchChange,
  serviceTypes,
  inventoryItems,
  inventoryLots,
  computeLineTotal,
  onAddService,
  onAddProduct,
  onUpdateItem,
  onRemoveItem,
  onApplyService,
  onApplyProduct,
  packageBalancesByItemId = {},
  onTogglePackage,
  pendingPriceApprovals = [],
  canApprovePrices = false,
  approvingPriceId = null,
  onApprovePrice,
  emptyServicesLabel = 'Nenhum serviço nesta comanda.',
  emptyProductsLabel = 'Nenhum produto de estoque nesta comanda.',
  productSearchHint = 'Buscar por nome, EAN ou SKU…',
}) => {
  const serviceRows = useMemo(
    () => items.map((it, idx) => ({ it, idx })).filter(({ it }) => !isProductItem(it)),
    [items],
  );
  const productRows = useMemo(
    () => items.map((it, idx) => ({ it, idx })).filter(({ it }) => isProductItem(it)),
    [items],
  );

  /** Fallback: se o pai não informou, infere multipet pelos nomes distintos nas linhas. */
  const showPetColumn = useMemo(() => {
    if (typeof showPetColumnProp === 'boolean') return showPetColumnProp;
    const names = new Set(
      items.map((it) => (it.pet_name ?? '').trim()).filter((n) => n.length > 0),
    );
    return names.size > 1;
  }, [items, showPetColumnProp]);

  /** Cards cujo estado aberto/fechado foi invertido pelo usuário (itens novos começam abertos). */
  const [toggledCards, setToggledCards] = useState<Set<string>>(() => new Set());

  const q = catalogSearch.trim().toLowerCase();

  const serviceComboOptions = useMemo((): HubComboboxOption[] => {
    const active = serviceTypes.filter((s) => !s.deleted_at && s.active !== false && !s.is_addon);
    const filtered = q ? active.filter((s) => s.name.toLowerCase().includes(q)) : active;
    const apps = filtered.filter((s) => Boolean(s.is_encounter_application));
    const others = filtered.filter((s) => !s.is_encounter_application);
    const sorted = [...apps, ...others];
    return [
      { value: '', label: '— Selecionar serviço —' },
      ...sorted.map((s) => ({
        value: s.id,
        label: s.is_encounter_application ? `${s.name} · aplicação` : s.name,
      })),
    ];
  }, [serviceTypes, q]);

  const productComboOptions = useMemo((): HubComboboxOption[] => {
    const active = inventoryItems.filter((p) => {
      if (p.deleted_at || p.active === false) return false;
      if (p.item_kind && p.item_kind !== 'product') return false;
      const purpose = (p.sale_purpose ?? '').trim().toUpperCase();
      return !purpose || purpose === 'SALE';
    });
    const filtered = q
      ? active.filter((p) => {
          const name = (p.name ?? '').toLowerCase();
          const ean = (p.ean ?? '').toLowerCase();
          const sku = (p.store_sku ?? '').toLowerCase();
          return name.includes(q) || ean.includes(q) || sku.includes(q);
        })
      : active;
    return [
      { value: '', label: '— Selecionar produto —' },
      ...filtered.map((p) => {
        const qty = Number(p.qty_on_hand ?? 0);
        const code = p.store_sku || p.ean;
        return {
          value: p.id,
          label: code ? `${p.name} · ${code} · estoque ${qty}` : `${p.name} · estoque ${qty}`,
        };
      }),
    ];
  }, [inventoryItems, q]);

  const lotOptionsForItem = (inventoryItemId: string | null): HubComboboxOption[] => {
    if (!inventoryItemId) return [{ value: '', label: '— Lote —' }];
    const lots = inventoryLots.filter(
      (lot) => lot.item_id === inventoryItemId && !isLotExpired(lot.expiry_date),
    );
    return [
      { value: '', label: '— Lote —' },
      ...lots.map((lot) => ({
        value: lot.id,
        label: `${lot.lot_code || 'Sem lote'} · ${Number(lot.qty_on_hand ?? 0)}`,
      })),
    ];
  };

  const renderServiceDescription = (
    it: ComandaItemDraft,
    idx: number,
    editable: boolean,
    isManual: boolean,
    idPrefix: string,
  ) => {
    if (editable && it.isNew) {
      return (
        <div className="hub-comanda-items__stack">
          <HubSearchableCombobox
            id={`${idPrefix}-svc-${idx}`}
            className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
            options={serviceComboOptions}
            value={it.hub_service_type_id ?? ''}
            onChange={(v) => void onApplyService(idx, v)}
            placeholder="— Selecionar serviço —"
            searchPlaceholder="Buscar na lista…"
            ariaLabel="Serviço"
          />
          {!it.hub_service_type_id ? (
            <input
              className="hub-orcamento-novo__input"
              placeholder="Descrição livre (sem serviço do catálogo)"
              value={it.description}
              onChange={(e) => onUpdateItem(idx, { description: e.target.value })}
            />
          ) : null}
        </div>
      );
    }
    if (editable && isManual) {
      return (
        <input
          className="hub-orcamento-novo__input"
          value={it.description}
          onChange={(e) => onUpdateItem(idx, { description: e.target.value })}
        />
      );
    }
    return (
      <span className="hub-public-quote__svc-title" title={it.origin_type ?? undefined}>
        {it.description}
      </span>
    );
  };

  const renderPackageBlock = (
    it: ComandaItemDraft,
    editable: boolean,
    idPrefix: string,
  ) => {
    const eligibleBalances = it.id ? packageBalancesByItemId[it.id] ?? [] : [];
    const coveredByPackage = Boolean(it.package_balance_id);
    if (coveredByPackage) {
      return <span className="hub-clientes__pill hub-dayboard__pill--open">Pacote</span>;
    }
    if (eligibleBalances.length > 0 && onTogglePackage && it.id && editable) {
      return (
        <div className="hub-comanda-items__stack">
          <HubSearchableCombobox
            id={`${idPrefix}-pkg-${it.id}`}
            className="hub-combobox--clientes"
            options={eligibleBalances.map((b) => {
              const pkg = Array.isArray(b.hub_packages) ? b.hub_packages[0] : b.hub_packages;
              return {
                value: b.id,
                label: `${pkg?.name ?? 'Pacote'} (${b.sessions_remaining})`,
              };
            })}
            value={it.package_balance_id ?? ''}
            onChange={(v) => onTogglePackage(it.id!, v || null)}
            placeholder="Avulso"
            ariaLabel="Usar pacote"
          />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            onClick={() => {
              const preferred = eligibleBalances[0]?.id;
              if (!preferred) return;
              if (
                !window.confirm(
                  'Aplicar pacote nesta linha? O valor será zerado e o consumo confirma no checkout.',
                )
              ) {
                return;
              }
              onTogglePackage(it.id!, preferred);
            }}
          >
            Aplicar pacote
          </button>
        </div>
      );
    }
    return <span className="hub-comanda-items__muted-inline">Avulso</span>;
  };

  const renderQtyInput = (it: ComandaItemDraft, idx: number, editable: boolean) =>
    editable ? (
      <input
        className="hub-orcamento-novo__input"
        inputMode="decimal"
        value={it.quantity}
        onChange={(e) => onUpdateItem(idx, { quantity: e.target.value })}
        aria-label="Quantidade"
      />
    ) : (
      <span>{it.quantity}</span>
    );

  const renderServiceUnitInput = (it: ComandaItemDraft, idx: number, editable: boolean) => {
    if (!editable) return <span>{fmtBrl(Number(it.unit_amount))}</span>;
    const svc = it.hub_service_type_id
      ? serviceTypes.find((s) => s.id === it.hub_service_type_id)
      : null;
    const locked = svc?.price_mode === 'fixed' && Boolean(it.hub_service_type_id);
    return (
      <input
        className="hub-orcamento-novo__input"
        inputMode="decimal"
        value={it.unit_amount}
        readOnly={locked}
        title={
          locked
            ? 'Este serviço tem preço fixo no catálogo. Só o financeiro pode ajustar via desconto.'
            : undefined
        }
        onChange={(e) => {
          if (locked) return;
          onUpdateItem(idx, { unit_amount: e.target.value });
        }}
        aria-label="Valor unitário"
      />
    );
  };

  const renderServiceDiscountInput = (it: ComandaItemDraft, idx: number, editable: boolean) =>
    editable ? (
      <input
        className="hub-orcamento-novo__input"
        inputMode="decimal"
        value={it.discount_amount}
        onChange={(e) => onUpdateItem(idx, { discount_amount: e.target.value })}
        aria-label="Desconto"
      />
    ) : (
      <span>{fmtBrl(Number(it.discount_amount))}</span>
    );

  const renderRemoveButton = (idx: number, label: string) => (
    <button
      type="button"
      className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost hub-orcamento-novo__btn--icon"
      aria-label={label}
      onClick={() => void onRemoveItem(idx)}
    >
      <Trash2 size={15} />
    </button>
  );

  const renderServiceRow = ({ it, idx }: { it: ComandaItemDraft; idx: number }) => {
    const editable = canEdit && !it.invoiced;
    const isManual = it.origin_type === 'manual' || it.origin_type === 'manual_line';
    return (
      <tr key={it.id ?? `svc-${idx}`} className={it.invoiced ? 'hub-comanda-row--invoiced' : ''}>
        <td className="hub-comanda-items__cell-service">
          {renderServiceDescription(it, idx, editable, isManual, 'comanda')}
        </td>
        {showPetColumn ? (
          <td className="hub-comanda-items__cell-pet">
            <span className="hub-comanda-items__pet-name" title={it.pet_name ?? undefined}>
              {it.pet_name?.trim() || '—'}
            </span>
          </td>
        ) : null}
        <td className="hub-comanda-items__cell-package">{renderPackageBlock(it, editable, 'comanda')}</td>
        <td className="right hub-comanda-items__cell-qty">{renderQtyInput(it, idx, editable)}</td>
        <td className="right hub-comanda-items__cell-money">
          {renderServiceUnitInput(it, idx, editable)}
        </td>
        <td className="right hub-comanda-items__cell-money">
          {renderServiceDiscountInput(it, idx, editable)}
        </td>
        <td className="right hub-comanda-items__cell-total">{fmtBrl(computeLineTotal(it))}</td>
        {canEdit ? (
          <td className="hub-comanda-items__cell-action">
            {it.invoiced ? (
              <span className="hub-orcamento-novo__services-table-cell--muted" style={{ fontSize: 11 }}>
                Faturado
              </span>
            ) : (
              renderRemoveButton(idx, 'Remover serviço')
            )}
          </td>
        ) : null}
      </tr>
    );
  };

  const cardKey = (prefix: string, it: ComandaItemDraft, idx: number) => `${prefix}-${it.id ?? `new-${idx}`}`;

  const isCardOpen = (key: string, it: ComandaItemDraft) => Boolean(it.isNew) !== toggledCards.has(key);

  const toggleCard = (key: string) => {
    setToggledCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderCardShell = ({
    key,
    it,
    title,
    emptyTitle,
    metaParts,
    badges,
    rowClassName,
    children,
  }: {
    key: string;
    it: ComandaItemDraft;
    title: string;
    emptyTitle: string;
    metaParts: string[];
    badges: React.ReactNode;
    rowClassName: string;
    children: React.ReactNode;
  }) => {
    const open = isCardOpen(key, it);
    const bodyId = `${key}-body`;
    return (
      <article
        key={key}
        className={`hub-comanda-items__card${open ? ' hub-comanda-items__card--open' : ''}${rowClassName}`}
      >
        <button
          type="button"
          className="hub-comanda-items__card-summary"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => toggleCard(key)}
        >
          <span className="hub-comanda-items__card-summary-main">
            <span
              className={`hub-comanda-items__card-summary-title${
                title.trim() ? '' : ' hub-comanda-items__card-summary-title--empty'
              }`}
            >
              {title.trim() || emptyTitle}
            </span>
            <span className="hub-comanda-items__card-summary-meta">
              {metaParts.filter(Boolean).join(' · ')}
              {badges}
            </span>
          </span>
          <span className="hub-comanda-items__card-summary-total">{fmtBrl(computeLineTotal(it))}</span>
          <ChevronDown size={18} className="hub-comanda-items__card-chevron" aria-hidden />
        </button>
        {open ? (
          <div id={bodyId} className="hub-comanda-items__card-body">
            {children}
          </div>
        ) : null}
      </article>
    );
  };

  const renderCardFooter = (it: ComandaItemDraft, idx: number, removeLabel: string) => {
    if (!canEdit || it.invoiced) return null;
    return (
      <div className="hub-comanda-items__card-actions">
        <button
          type="button"
          className="hub-comanda-items__card-remove"
          onClick={() => void onRemoveItem(idx)}
        >
          <Trash2 size={15} aria-hidden />
          {removeLabel}
        </button>
      </div>
    );
  };

  const renderServiceCard = ({ it, idx }: { it: ComandaItemDraft; idx: number }) => {
    const editable = canEdit && !it.invoiced;
    const isManual = it.origin_type === 'manual' || it.origin_type === 'manual_line';
    const showDescriptionEditor = editable && (Boolean(it.isNew) || isManual);
    const key = cardKey('svc-m', it, idx);
    return renderCardShell({
      key,
      it,
      title: it.description,
      emptyTitle: 'Novo serviço',
      metaParts: [
        `${it.quantity} × ${fmtBrl(Number(it.unit_amount))}`,
        showPetColumn ? it.pet_name?.trim() ?? '' : '',
      ],
      badges: (
        <>
          {it.package_balance_id ? <span className="hub-comanda-items__chip">Pacote</span> : null}
          {it.invoiced ? <span className="hub-comanda-items__chip hub-comanda-items__chip--muted">Faturado</span> : null}
        </>
      ),
      rowClassName: it.invoiced ? ' hub-comanda-row--invoiced' : '',
      children: (
        <>
          {showDescriptionEditor ? (
            <div className="hub-comanda-items__card-field">
              <FieldLabel>Serviço</FieldLabel>
              {renderServiceDescription(it, idx, editable, isManual, 'comanda-m')}
            </div>
          ) : null}

          <div className="hub-comanda-items__card-field">
            <FieldLabel>Pacote</FieldLabel>
            {renderPackageBlock(it, editable, 'comanda-m')}
          </div>

          <div className="hub-comanda-items__card-grid">
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Qtd</FieldLabel>
              {renderQtyInput(it, idx, editable)}
            </label>
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Valor unit.</FieldLabel>
              {renderServiceUnitInput(it, idx, editable)}
            </label>
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Desconto</FieldLabel>
              {renderServiceDiscountInput(it, idx, editable)}
            </label>
          </div>

          {renderCardFooter(it, idx, 'Remover serviço')}
        </>
      ),
    });
  };

  const renderProductDescription = (
    it: ComandaItemDraft,
    idx: number,
    editable: boolean,
    idPrefix: string,
  ) => {
    if (editable && it.isNew) {
      return (
        <HubSearchableCombobox
          id={`${idPrefix}-prd-${idx}`}
          className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
          options={productComboOptions}
          value={it.hub_inventory_item_id ?? ''}
          onChange={(v) => void onApplyProduct(idx, v)}
          placeholder="— Selecionar produto —"
          searchPlaceholder={productSearchHint}
          ariaLabel="Produto"
        />
      );
    }
    return (
      <span className="hub-public-quote__svc-title">
        {it.description}
        {it.returned ? (
          <span className="hub-payables__chip hub-payables__chip--partial" style={{ marginLeft: 8 }}>
            Devolvido
          </span>
        ) : null}
      </span>
    );
  };

  const renderLotBlock = (
    it: ComandaItemDraft,
    idx: number,
    editable: boolean,
    isManual: boolean,
    idPrefix: string,
  ) => {
    if (editable && (it.isNew || isManual)) {
      return (
        <HubSearchableCombobox
          id={`${idPrefix}-lot-${idx}`}
          className="hub-orcamento-novo__combobox"
          options={lotOptionsForItem(it.hub_inventory_item_id)}
          value={it.hub_inventory_lot_id ?? ''}
          onChange={(v) => onUpdateItem(idx, { hub_inventory_lot_id: v || null })}
          placeholder="— Lote —"
          searchPlaceholder="Buscar lote…"
          ariaLabel="Lote"
          disabled={!it.hub_inventory_item_id}
        />
      );
    }
    return (
      <span className="hub-orcamento-novo__services-table-cell--muted">
        {it.hub_inventory_lot_id
          ? inventoryLots.find((l) => l.id === it.hub_inventory_lot_id)?.lot_code || 'Lote'
          : '—'}
      </span>
    );
  };

  const renderProductUnitInput = (
    it: ComandaItemDraft,
    idx: number,
    editable: boolean,
    priceLocked: boolean,
  ) => {
    if (!editable) return <span>{fmtBrl(Number(it.unit_amount))}</span>;
    return (
      <input
        className="hub-orcamento-novo__input"
        inputMode="decimal"
        value={it.unit_amount}
        readOnly={priceLocked}
        title={
          priceLocked
            ? 'Preço fixo no catálogo (override desabilitado neste produto).'
            : undefined
        }
        onChange={(e) => {
          if (priceLocked) return;
          onUpdateItem(idx, { unit_amount: e.target.value });
        }}
        aria-label="Valor unitário"
      />
    );
  };

  const renderProductDiscountInput = (
    it: ComandaItemDraft,
    idx: number,
    editable: boolean,
    inv: HubInventoryItem | null | undefined,
    maxDiscountPct: number,
    maxDiscountAmount: number,
  ) => {
    if (!editable) return <span>{fmtBrl(Number(it.discount_amount))}</span>;
    return (
      <input
        className="hub-orcamento-novo__input"
        inputMode="decimal"
        value={it.discount_amount}
        title={
          inv
            ? maxDiscountPct > 0
              ? `Desconto máximo: ${maxDiscountPct}% (${fmtBrl(maxDiscountAmount)})`
              : 'Este produto não permite desconto'
            : undefined
        }
        onChange={(e) => {
          const raw = e.target.value;
          const next = Number(String(raw).replace(',', '.'));
          if (Number.isFinite(next) && next > maxDiscountAmount + 0.009) {
            onUpdateItem(idx, { discount_amount: String(maxDiscountAmount) });
            return;
          }
          onUpdateItem(idx, { discount_amount: raw });
        }}
        aria-label="Desconto"
      />
    );
  };

  const renderProductRow = ({ it, idx }: { it: ComandaItemDraft; idx: number }) => {
    const editable = canEdit && !it.invoiced && !it.returned;
    const isManual = it.origin_type === 'manual' || it.origin_type === 'manual_line';
    const inv = it.hub_inventory_item_id
      ? inventoryItems.find((p) => p.id === it.hub_inventory_item_id)
      : null;
    const priceLocked = Boolean(inv && !inv.allow_price_override_on_sale);
    const maxDiscountPct = Math.max(0, Math.min(100, Number(inv?.max_sale_discount_pct ?? 0)));
    const qtyNum = Number(String(it.quantity).replace(',', '.')) || 0;
    const unitNum = Number(String(it.unit_amount).replace(',', '.')) || 0;
    const maxDiscountAmount = Math.round(((qtyNum * unitNum * maxDiscountPct) / 100) * 100) / 100;
    return (
      <tr
        key={it.id ?? `prd-${idx}`}
        className={`${it.invoiced ? 'hub-comanda-row--invoiced' : ''}${
          it.returned ? ' hub-comanda-row--returned' : ''
        }`.trim()}
      >
        <td className="hub-comanda-items__cell-service">
          {renderProductDescription(it, idx, editable, 'comanda')}
        </td>
        <td className="hub-comanda-items__cell-lot">
          {renderLotBlock(it, idx, editable, isManual, 'comanda')}
        </td>
        <td className="right hub-comanda-items__cell-qty">{renderQtyInput(it, idx, editable)}</td>
        <td className="right hub-comanda-items__cell-money">
          {renderProductUnitInput(it, idx, editable, priceLocked)}
        </td>
        <td className="right hub-comanda-items__cell-money">
          {renderProductDiscountInput(it, idx, editable, inv, maxDiscountPct, maxDiscountAmount)}
        </td>
        <td className="right hub-comanda-items__cell-total">{fmtBrl(computeLineTotal(it))}</td>
        {canEdit ? (
          <td className="hub-comanda-items__cell-action">
            {it.invoiced ? (
              <span className="hub-orcamento-novo__services-table-cell--muted" style={{ fontSize: 11 }}>
                Faturado
              </span>
            ) : (
              renderRemoveButton(idx, 'Remover produto')
            )}
          </td>
        ) : null}
      </tr>
    );
  };

  const renderProductCard = ({ it, idx }: { it: ComandaItemDraft; idx: number }) => {
    const editable = canEdit && !it.invoiced && !it.returned;
    const isManual = it.origin_type === 'manual' || it.origin_type === 'manual_line';
    const inv = it.hub_inventory_item_id
      ? inventoryItems.find((p) => p.id === it.hub_inventory_item_id)
      : null;
    const priceLocked = Boolean(inv && !inv.allow_price_override_on_sale);
    const maxDiscountPct = Math.max(0, Math.min(100, Number(inv?.max_sale_discount_pct ?? 0)));
    const qtyNum = Number(String(it.quantity).replace(',', '.')) || 0;
    const unitNum = Number(String(it.unit_amount).replace(',', '.')) || 0;
    const maxDiscountAmount = Math.round(((qtyNum * unitNum * maxDiscountPct) / 100) * 100) / 100;
    const key = cardKey('prd-m', it, idx);
    const lotCode = it.hub_inventory_lot_id
      ? inventoryLots.find((l) => l.id === it.hub_inventory_lot_id)?.lot_code
      : null;
    return renderCardShell({
      key,
      it,
      title: it.description,
      emptyTitle: 'Novo produto',
      metaParts: [
        `${it.quantity} × ${fmtBrl(Number(it.unit_amount))}`,
        lotCode ? `Lote ${lotCode}` : '',
      ],
      badges: (
        <>
          {it.returned ? <span className="hub-comanda-items__chip hub-comanda-items__chip--warn">Devolvido</span> : null}
          {it.invoiced ? <span className="hub-comanda-items__chip hub-comanda-items__chip--muted">Faturado</span> : null}
        </>
      ),
      rowClassName: `${it.invoiced ? ' hub-comanda-row--invoiced' : ''}${it.returned ? ' hub-comanda-row--returned' : ''}`,
      children: (
        <>
          {editable && it.isNew ? (
            <div className="hub-comanda-items__card-field">
              <FieldLabel>Produto</FieldLabel>
              {renderProductDescription(it, idx, editable, 'comanda-m')}
            </div>
          ) : null}

          <div className="hub-comanda-items__card-field">
            <FieldLabel>Lote</FieldLabel>
            {renderLotBlock(it, idx, editable, isManual, 'comanda-m')}
          </div>

          <div className="hub-comanda-items__card-grid">
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Qtd</FieldLabel>
              {renderQtyInput(it, idx, editable)}
            </label>
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Valor unit.</FieldLabel>
              {renderProductUnitInput(it, idx, editable, priceLocked)}
            </label>
            <label className="hub-comanda-items__card-field">
              <FieldLabel>Desconto</FieldLabel>
              {renderProductDiscountInput(it, idx, editable, inv, maxDiscountPct, maxDiscountAmount)}
            </label>
          </div>

          {renderCardFooter(it, idx, 'Remover produto')}
        </>
      ),
    });
  };

  return (
    <div className="hub-comanda-items">
      {canEdit ? (
        <div className="hub-comanda-items__toolbar">
          <div className="hub-orcamento-novo__services-search-wrap">
            <Search size={17} className="hub-orcamento-novo__services-search-icon" aria-hidden />
            <input
              type="search"
              className="hub-orcamento-novo__input hub-orcamento-novo__services-search-input"
              placeholder="Buscar serviços e produtos"
              value={catalogSearch}
              onChange={(e) => onCatalogSearchChange(e.target.value)}
              aria-label="Buscar serviços e produtos"
            />
          </div>
        </div>
      ) : null}

      {pendingPriceApprovals.length > 0 ? (
        <section
          className="hub-comanda-items__subsection"
          aria-labelledby="comanda-pending-prices"
          style={{ marginBottom: 16 }}
        >
          <h3 id="comanda-pending-prices" className="hub-comanda-items__subsection-title">
            Pendentes de aprovação financeira
          </h3>
          <p className="hub-clientes__muted" style={{ marginTop: 0, fontSize: 13 }}>
            Valores de cirurgia/internação fora da faixa (ou sem faixa) ainda não entram no total da
            comanda.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {pendingPriceApprovals.map((p) => (
              <li key={`${p.kind}-${p.id}`} style={{ marginBottom: 8 }}>
                {p.service_name} — {fmtBrl(Number(p.unit_amount))} × {p.quantity}
                {canApprovePrices && onApprovePrice ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="hub-quote-detail__text-btn"
                      disabled={approvingPriceId === p.id}
                      onClick={() => onApprovePrice(p)}
                    >
                      {approvingPriceId === p.id ? 'Aprovando…' : 'Aprovar preço'}
                    </button>
                  </>
                ) : (
                  <span className="hub-clientes__muted"> · aguardando financeiro</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hub-comanda-items__subsection" aria-labelledby="comanda-items-services">
        <div className="hub-comanda-items__subsection-head">
          <h3 id="comanda-items-services" className="hub-comanda-items__subsection-title">
            Serviços
          </h3>
          {canEdit ? (
            <button type="button" className="hub-quote-detail__text-btn" onClick={onAddService}>
              + Adicionar serviço
            </button>
          ) : null}
        </div>
        {serviceRows.length === 0 ? (
          <p className="hub-comanda-items__empty">{emptyServicesLabel}</p>
        ) : (
          <>
            <div className="hub-comanda-items__table-wrap hub-comanda-items__desktop">
              <table className="hub-orcamento-novo__services-table hub-quote-detail__svc-table">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    {showPetColumn ? <th className="hub-comanda-items__col-pet">Pet</th> : null}
                    <th>Pacote</th>
                    <th className="right hub-comanda-items__col-qty">Qtd</th>
                    <th className="right hub-comanda-items__col-money">Valor unit.</th>
                    <th className="right hub-comanda-items__col-money">Desconto</th>
                    <th className="right hub-comanda-items__col-money">Total linha</th>
                    {canEdit ? (
                      <th className="hub-orcamento-novo__services-table-col--action" aria-label="Ações" />
                    ) : null}
                  </tr>
                </thead>
                <tbody>{serviceRows.map(renderServiceRow)}</tbody>
              </table>
            </div>
            <div className="hub-comanda-items__cards hub-comanda-items__mobile" aria-label="Serviços">
              {serviceRows.map(renderServiceCard)}
            </div>
          </>
        )}
      </section>

      <div className="hub-comanda-items__divider" role="separator" />

      <section className="hub-comanda-items__subsection" aria-labelledby="comanda-items-products">
        <div className="hub-comanda-items__subsection-head">
          <h3 id="comanda-items-products" className="hub-comanda-items__subsection-title">
            Produtos
          </h3>
          {canEdit ? (
            <button type="button" className="hub-quote-detail__text-btn" onClick={onAddProduct}>
              + Adicionar produto
            </button>
          ) : null}
        </div>
        {productRows.length === 0 ? (
          <p className="hub-comanda-items__empty">{emptyProductsLabel}</p>
        ) : (
          <>
            <div className="hub-comanda-items__table-wrap hub-comanda-items__desktop">
              <table className="hub-orcamento-novo__services-table hub-quote-detail__svc-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Lote</th>
                    <th className="right hub-comanda-items__col-qty">Qtd</th>
                    <th className="right hub-comanda-items__col-money">Valor unit.</th>
                    <th className="right hub-comanda-items__col-money">Desconto</th>
                    <th className="right hub-comanda-items__col-money">Total linha</th>
                    {canEdit ? (
                      <th className="hub-orcamento-novo__services-table-col--action" aria-label="Ações" />
                    ) : null}
                  </tr>
                </thead>
                <tbody>{productRows.map(renderProductRow)}</tbody>
              </table>
            </div>
            <div className="hub-comanda-items__cards hub-comanda-items__mobile" aria-label="Produtos">
              {productRows.map(renderProductCard)}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
