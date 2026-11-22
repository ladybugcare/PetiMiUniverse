import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Dog, ScanLine, ShoppingBag, User, UserPlus } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubGuardiansApi, type HubGuardian } from '../../api/hubGuardiansApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../components/HubSidePanel';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { QuickSaleCart } from './QuickSaleCart';
import {
  computeLineTotal,
  newProductDraft,
  newServiceDraft,
  NEW_ITEM_KEY_PREFIX,
  parseMoney,
  type ComandaItemDraft,
} from './comandaItemDraft';
import '../clientes/clientes.css';
import './hub-finance-page.css';

type Props = {
  open: boolean;
  unitId: string | null;
  onClose: () => void;
  /** Abre a página da comanda (fluxo secundário). */
  onOpened: (comandaId: string) => void;
  /** Cobrar agora no mesmo fluxo (PDV). */
  onCheckout?: (comandaId: string) => void;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function formatBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isSellableProduct(p: HubInventoryItem): boolean {
  if (p.deleted_at) return false;
  if (p.active === false) return false;
  if (p.item_kind !== 'product') return false;
  const purpose = (p.sale_purpose ?? '').trim().toUpperCase();
  return !purpose || purpose === 'SALE';
}

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase();
}

function matchInventoryByCode(items: HubInventoryItem[], code: string): HubInventoryItem | null {
  const raw = code.trim();
  if (!raw) return null;
  const norm = normalizeCode(raw);
  const digits = digitsOnly(raw);
  const exact =
    items.find((p) => p.ean && digitsOnly(p.ean) === digits && digits.length >= 8) ||
    items.find((p) => p.store_sku && normalizeCode(p.store_sku) === norm) ||
    items.find((p) => p.ean && normalizeCode(p.ean) === norm);
  return exact ?? null;
}

function pickLotWithStock(lots: HubInventoryLotRow[], itemId: string): HubInventoryLotRow | undefined {
  return (
    lots.find((l) => l.item_id === itemId && Number(l.qty_on_hand ?? 0) > 0) ??
    lots.find((l) => l.item_id === itemId)
  );
}

export const QuickSaleDrawer: React.FC<Props> = ({ open, unitId, onClose, onOpened, onCheckout }) => {
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [petId, setPetId] = useState('');
  const [showClientSection, setShowClientSection] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingGuardian, setCreatingGuardian] = useState(false);
  const [items, setItems] = useState<ComandaItemDraft[]>([]);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [scanCode, setScanCode] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const newItemCounterRef = useRef(0);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const inventoryItemsRef = useRef<HubInventoryItem[]>([]);
  const inventoryLotsRef = useRef<HubInventoryLotRow[]>([]);

  useEffect(() => {
    inventoryItemsRef.current = inventoryItems;
  }, [inventoryItems]);
  useEffect(() => {
    inventoryLotsRef.current = inventoryLots;
  }, [inventoryLots]);

  const sellableProducts = useMemo(() => inventoryItems.filter(isSellableProduct), [inventoryItems]);

  const resetForm = useCallback(() => {
    setGuardianId('');
    setPetId('');
    setPets([]);
    setShowClientSection(false);
    setShowQuickCreate(false);
    setFullName('');
    setPhone('');
    setTaxId('');
    setCreateError(null);
    setItems([]);
    setScanCode('');
    setScanFeedback(null);
    newItemCounterRef.current = 0;
  }, []);

  const load = useCallback(async () => {
    if (!clinicId || !open) return;
    setLoading(true);
    try {
      const [guRes, svcRes, invRes] = await Promise.all([
        hubGuardiansApi.list(clinicId, true, { status: 'active' }),
        hubServiceTypesApi.list(clinicId, false),
        hubInventoryApi.items.list(clinicId, false, 'product'),
      ]);
      setGuardians(guRes.guardians ?? []);
      setServiceTypes(svcRes.service_types ?? []);
      setInventoryItems(invRes.items ?? []);
      try {
        const lotsRes = await hubInventoryApi.lots.list(clinicId);
        setInventoryLots(lotsRes.lots ?? []);
      } catch {
        setInventoryLots([]);
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar dados da venda rápida');
    } finally {
      setLoading(false);
    }
  }, [clinicId, open, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || loading) return;
    const t = window.setTimeout(() => scanInputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, loading]);

  useEffect(() => {
    if (!clinicId || !guardianId) {
      setPets([]);
      setPetId('');
      return;
    }
    void hubPetsApi
      .list(clinicId)
      .then((r) => {
        const all = r.pets ?? [];
        setPets(
          all.filter(
            (p) =>
              p.primary_guardian?.guardian_id === guardianId ||
              p.secondary_guardian?.guardian_id === guardianId,
          ),
        );
      })
      .catch(() => setPets([]));
    setPetId('');
  }, [clinicId, guardianId]);

  const guardianOptions = useMemo(
    () => [
      { value: '', label: '— Cliente avulso (sem tutor) —' },
      ...guardians.map((g) => ({
        value: g.id,
        label: g.phone ? `${g.full_name} · ${g.phone}` : g.full_name,
        icon: <User size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [guardians],
  );

  const petOptions = useMemo(
    () => [
      { value: '', label: '— Sem pet —' },
      ...pets.map((p) => ({
        value: p.id,
        label: p.name,
        icon: <Dog size={16} strokeWidth={2} aria-hidden />,
      })),
    ],
    [pets],
  );

  const cartTotal = useMemo(
    () => items.reduce((s, it) => s + computeLineTotal(it), 0),
    [items],
  );

  const readyItems = useMemo(
    () =>
      items.filter((it) => {
        const desc = it.description.trim();
        if (!desc || parseMoney(it.quantity) <= 0) return false;
        if (it.item_kind === 'product') {
          return Boolean(it.hub_inventory_item_id && it.hub_inventory_lot_id);
        }
        return Boolean(it.hub_service_type_id);
      }),
    [items],
  );

  const productMissingLot = useMemo(
    () =>
      items.some(
        (it) =>
          it.item_kind === 'product' &&
          it.hub_inventory_item_id &&
          !it.hub_inventory_lot_id &&
          parseMoney(it.quantity) > 0,
      ),
    [items],
  );

  const canSubmitBase = Boolean(clinicId && unitId && !submitting);

  const updateItem = (idx: number, patch: Partial<ComandaItemDraft>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.line_total = computeLineTotal(next);
        return next;
      }),
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const bumpQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const nextQty = Math.max(1, parseMoney(it.quantity) + delta);
        const next = { ...it, quantity: String(nextQty) };
        next.line_total = computeLineTotal(next);
        return next;
      }),
    );
  };

  const addServiceById = (serviceTypeId: string) => {
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    if (!st) return;
    const key = `${NEW_ITEM_KEY_PREFIX}svc-${newItemCounterRef.current++}`;
    const draft: ComandaItemDraft = {
      ...newServiceDraft(),
      id: key,
      hub_service_type_id: st.id,
      description: st.name,
      unit_amount: String(st.sale_amount ?? 0),
      quantity: '1',
    };
    draft.line_total = computeLineTotal(draft);
    setItems((prev) => [...prev, draft]);
  };

  const addOrIncrementProduct = useCallback((inv: HubInventoryItem, lots: HubInventoryLotRow[]) => {
    const lot = pickLotWithStock(lots, inv.id);
    const onHand = Number(inv.qty_on_hand ?? lot?.qty_on_hand ?? 0);
    if (onHand <= 0 || !lot) {
      setScanFeedback({ tone: 'err', text: `${inv.name}: sem estoque disponível` });
      return false;
    }
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) =>
          it.item_kind === 'product' &&
          it.hub_inventory_item_id === inv.id &&
          (it.hub_inventory_lot_id === lot.id || !it.hub_inventory_lot_id),
      );
      if (existingIdx >= 0) {
        return prev.map((it, i) => {
          if (i !== existingIdx) return it;
          const qty = parseMoney(it.quantity) + 1;
          const next = {
            ...it,
            quantity: String(qty),
            hub_inventory_lot_id: it.hub_inventory_lot_id || lot.id,
          };
          next.line_total = computeLineTotal(next);
          return next;
        });
      }
      const key = `${NEW_ITEM_KEY_PREFIX}prd-${newItemCounterRef.current++}`;
      const draft: ComandaItemDraft = {
        ...newProductDraft(),
        id: key,
        hub_inventory_item_id: inv.id,
        hub_inventory_lot_id: lot.id,
        description: inv.name,
        unit_amount: String(inv.sale_amount ?? 0),
        quantity: '1',
      };
      draft.line_total = computeLineTotal(draft);
      return [...prev, draft];
    });
    setScanFeedback({ tone: 'ok', text: `${inv.name} adicionado` });
    return true;
  }, []);

  const addProductById = (inventoryItemId: string) => {
    const inv =
      sellableProducts.find((i) => i.id === inventoryItemId) ??
      inventoryItems.find((i) => i.id === inventoryItemId);
    if (!inv) return;
    const ok = addOrIncrementProduct(inv, inventoryLots);
    if (!ok) showError(`${inv.name}: sem estoque disponível`);
  };

  const handleScanSubmit = async () => {
    const code = scanCode.trim();
    if (!code || !clinicId || scanning) return;
    setScanning(true);
    setScanFeedback(null);
    try {
      let hit = matchInventoryByCode(sellableProducts, code);
      if (!hit) {
        const res = await hubInventoryApi.items.list(clinicId, true, 'product', code);
        const found = (res.items ?? []).filter(isSellableProduct);
        hit = matchInventoryByCode(found, code) ?? found[0] ?? null;
        if (hit && !inventoryItemsRef.current.some((i) => i.id === hit!.id)) {
          setInventoryItems((prev) => [...prev, hit!]);
        }
      }
      if (!hit) {
        setScanFeedback({ tone: 'err', text: 'Código não encontrado' });
        return;
      }
      addOrIncrementProduct(hit, inventoryLotsRef.current);
    } catch (e: unknown) {
      setScanFeedback({ tone: 'err', text: (e as Error)?.message || 'Erro na leitura' });
    } finally {
      setScanCode('');
      setScanning(false);
      scanInputRef.current?.focus();
    }
  };

  const handleQuickCreate = async () => {
    if (!clinicId) return;
    setCreateError(null);
    if (!fullName.trim()) {
      setCreateError('Informe o nome do tutor.');
      return;
    }
    if (!phone.trim()) {
      setCreateError('Informe o telefone.');
      return;
    }
    if (!taxId.trim()) {
      setCreateError('Informe o CPF.');
      return;
    }

    setCreatingGuardian(true);
    try {
      const q = digitsOnly(taxId).length >= 11 ? digitsOnly(taxId) : phone.trim();
      if (q) {
        const { guardians: hits } = await hubGuardiansApi.list(clinicId, false, { status: 'active', q });
        const hit = hits[0];
        if (hit) {
          setCreateError(`Cliente já cadastrado: ${hit.full_name}. Selecione-o na lista.`);
          setCreatingGuardian(false);
          return;
        }
      }
      const { guardian } = await hubGuardiansApi.create({
        clinic_id: clinicId,
        client_kind: 'individual',
        full_name: fullName.trim(),
        phone: phone.trim(),
        tax_id: taxId.trim(),
        lead_source: 'Passante',
      });
      setGuardians((prev) => {
        if (prev.some((g) => g.id === guardian.id)) return prev;
        return [guardian, ...prev];
      });
      setGuardianId(guardian.id);
      setShowQuickCreate(false);
      setFullName('');
      setPhone('');
      setTaxId('');
    } catch (e: unknown) {
      setCreateError((e as Error)?.message || 'Erro ao cadastrar tutor');
    } finally {
      setCreatingGuardian(false);
    }
  };

  const openComandaWithItems = async (): Promise<string> => {
    if (!clinicId || !unitId) throw new Error('Selecione a unidade.');
    if (readyItems.length === 0) throw new Error('Adicione ao menos um produto ou serviço.');
    if (productMissingLot) throw new Error('Selecione o lote de cada produto.');

    const detail = await hubComandaApi.openComanda({
      clinic_id: clinicId,
      origin_type: 'manual',
      guardian_id: guardianId || null,
      pet_id: petId || null,
      unit_id: unitId,
      manual_lines: [],
    });
    const comandaId = (detail.comanda as Record<string, unknown>).id as string;
    await hubComandaApi.addItems(comandaId, {
      clinic_id: clinicId,
      edit_context: 'caixa',
      items: readyItems.map((it) => ({
        pet_id: petId || null,
        hub_service_type_id: it.hub_service_type_id,
        hub_inventory_item_id: it.hub_inventory_item_id,
        hub_inventory_lot_id: it.hub_inventory_lot_id,
        description: it.description.trim(),
        quantity: parseMoney(it.quantity),
        unit_amount: parseMoney(it.unit_amount),
        discount_amount: parseMoney(it.discount_amount),
        item_kind: it.item_kind,
      })),
    });
    return comandaId;
  };

  const handleCheckout = async () => {
    if (!canSubmitBase) return;
    setSubmitting(true);
    try {
      const comandaId = await openComandaWithItems();
      if (onCheckout) {
        onCheckout(comandaId);
        onClose();
      } else {
        onOpened(comandaId);
        onClose();
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao finalizar venda rápida');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenOnly = async () => {
    if (!canSubmitBase) return;
    setSubmitting(true);
    try {
      const comandaId =
        readyItems.length > 0
          ? await openComandaWithItems()
          : (
              await hubComandaApi.openComanda({
                clinic_id: clinicId!,
                origin_type: 'manual',
                guardian_id: guardianId || null,
                pet_id: petId || null,
                unit_id: unitId!,
                manual_lines: [],
              })
            ).comanda.id as string;
      onOpened(comandaId);
      onClose();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir comanda');
    } finally {
      setSubmitting(false);
    }
  };

  const clientSummary = guardianId
    ? guardians.find((g) => g.id === guardianId)?.full_name ?? 'Tutor selecionado'
    : 'Cliente avulso';

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Venda rápida"
      titleIcon={<ShoppingBag size={20} strokeWidth={1.75} />}
      subtitle="Passe o código, monte o carrinho e cobre — tutor e pet são opcionais."
      footer={
        <div className="hub-sell-package__footer">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost"
            disabled={!canSubmitBase}
            onClick={() => void handleOpenOnly()}
          >
            Abrir comanda
          </button>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!canSubmitBase || readyItems.length === 0 || productMissingLot}
            onClick={() => void handleCheckout()}
            title={productMissingLot ? 'Selecione o lote dos produtos' : undefined}
          >
            <ShoppingBag size={16} aria-hidden />
            {submitting ? 'Abrindo…' : `Cobrar ${formatBrl(cartTotal)}`}
          </button>
        </div>
      }
    >
      {loading ? (
        <HubLoading variant="inline" label="Carregando catálogo…" />
      ) : (
        <div className="hub-sell-package__form hub-quick-sale">
          <div className="hub-quick-sale__scan">
            <label className="hub-clientes__label" htmlFor="quick-sale-scan">
              Código de barras / SKU
            </label>
            <div className="hub-quick-sale__scan-row">
              <ScanLine size={18} strokeWidth={2} aria-hidden className="hub-quick-sale__scan-icon" />
              <input
                ref={scanInputRef}
                id="quick-sale-scan"
                className="hub-clientes__input hub-quick-sale__scan-input"
                value={scanCode}
                onChange={(e) => {
                  setScanCode(e.target.value);
                  if (scanFeedback) setScanFeedback(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleScanSubmit();
                  }
                }}
                placeholder="Passe o leitor ou digite e Enter"
                autoComplete="off"
                inputMode="text"
                disabled={scanning}
                aria-describedby={scanFeedback ? 'quick-sale-scan-feedback' : undefined}
              />
            </div>
            {scanFeedback ? (
              <p
                id="quick-sale-scan-feedback"
                className={
                  scanFeedback.tone === 'ok'
                    ? 'hub-quick-sale__scan-feedback hub-quick-sale__scan-feedback--ok'
                    : 'hub-quick-sale__scan-feedback hub-quick-sale__scan-feedback--err'
                }
                role="status"
              >
                {scanFeedback.text}
              </p>
            ) : (
              <p className="hub-clientes__muted hub-sell-package__hint" style={{ marginTop: 6 }}>
                Leitores USB digitam o código e enviam Enter automaticamente.
              </p>
            )}
          </div>

          <QuickSaleCart
            items={items}
            serviceTypes={serviceTypes}
            inventoryItems={sellableProducts}
            inventoryLots={inventoryLots}
            cartTotal={cartTotal}
            onAddProductById={addProductById}
            onAddServiceById={addServiceById}
            onUpdateItem={updateItem}
            onRemoveItem={removeItem}
            onBumpQty={bumpQty}
          />
          {productMissingLot ? (
            <p className="hub-clientes__error" style={{ marginTop: 0 }}>
              Selecione o lote de cada produto antes de cobrar.
            </p>
          ) : null}

          <div className="hub-quick-sale__client">
            <button
              type="button"
              className="hub-quick-sale__client-toggle"
              onClick={() => setShowClientSection((v) => !v)}
              aria-expanded={showClientSection}
            >
              <span>
                <User size={16} strokeWidth={2} aria-hidden />
                Cliente (opcional)
              </span>
              <span className="hub-quick-sale__client-summary">
                {clientSummary}
                {showClientSection ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              </span>
            </button>

            {showClientSection ? (
              <div className="hub-quick-sale__client-body">
                <div className="hub-clientes__field">
                  <div className="hub-sell-package__pets-head">
                    <label className="hub-clientes__label" htmlFor="quick-sale-guardian">
                      Tutor
                    </label>
                    {!showQuickCreate ? (
                      <button
                        type="button"
                        className="hub-clientes__link-btn hub-clientes__link-btn--with-icon"
                        onClick={() => {
                          setShowQuickCreate(true);
                          setCreateError(null);
                        }}
                      >
                        <UserPlus size={14} strokeWidth={2.25} aria-hidden />
                        Cadastrar rápido
                      </button>
                    ) : null}
                  </div>
                  <HubSearchableCombobox
                    id="quick-sale-guardian"
                    options={guardianOptions}
                    value={guardianId}
                    onChange={(id) => {
                      setGuardianId(id);
                      setShowQuickCreate(false);
                    }}
                    placeholder="Avulso ou buscar tutor…"
                    searchPlaceholder="Nome, telefone ou CPF"
                    ariaLabel="Tutor"
                    triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
                  />
                </div>

                {showQuickCreate ? (
                  <div className="hub-sell-package__line-card" style={{ marginBottom: 12 }}>
                    <p className="hub-clientes__muted hub-sell-package__hint" style={{ marginTop: 0 }}>
                      Cadastro mínimo para vincular a venda. Depois você completa a ficha.
                    </p>
                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="quick-sale-name">
                        Nome
                      </label>
                      <input
                        id="quick-sale-name"
                        className="hub-clientes__input"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                      />
                    </div>
                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="quick-sale-phone">
                        Telefone
                      </label>
                      <input
                        id="quick-sale-phone"
                        className="hub-clientes__input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                    <div className="hub-clientes__field">
                      <label className="hub-clientes__label" htmlFor="quick-sale-tax">
                        CPF
                      </label>
                      <input
                        id="quick-sale-tax"
                        className="hub-clientes__input"
                        value={taxId}
                        onChange={(e) => setTaxId(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    {createError ? <p className="hub-clientes__error">{createError}</p> : null}
                    <div className="hub-sell-package__footer" style={{ padding: 0, marginTop: 8 }}>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => {
                          setShowQuickCreate(false);
                          setCreateError(null);
                        }}
                        disabled={creatingGuardian}
                      >
                        Fechar
                      </button>
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        onClick={() => void handleQuickCreate()}
                        disabled={creatingGuardian}
                      >
                        {creatingGuardian ? 'Salvando…' : 'Salvar tutor'}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="quick-sale-pet">
                    Pet (opcional)
                  </label>
                  <HubSearchableCombobox
                    id="quick-sale-pet"
                    options={petOptions}
                    value={petId}
                    onChange={setPetId}
                    placeholder={guardianId ? 'Sem pet ou escolher…' : 'Só com tutor selecionado'}
                    searchPlaceholder="Nome do pet"
                    ariaLabel="Pet"
                    disabled={!guardianId}
                    triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </HubSidePanel>
  );
};
