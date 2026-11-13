import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dog, ShoppingBag, User, UserPlus } from 'lucide-react';
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
import { ComandaItemsSection } from './ComandaItemsSection';
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

export const QuickSaleDrawer: React.FC<Props> = ({ open, unitId, onClose, onOpened, onCheckout }) => {
  const clinicId = getStoredClinicId();
  const { showError } = useAlert();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [petId, setPetId] = useState('');
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [taxId, setTaxId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingGuardian, setCreatingGuardian] = useState(false);
  const [items, setItems] = useState<ComandaItemDraft[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const newItemCounterRef = useRef(0);

  const resetForm = useCallback(() => {
    setGuardianId('');
    setPetId('');
    setPets([]);
    setShowQuickCreate(false);
    setFullName('');
    setPhone('');
    setTaxId('');
    setCreateError(null);
    setItems([]);
    setCatalogSearch('');
    newItemCounterRef.current = 0;
  }, []);

  const load = useCallback(async () => {
    if (!clinicId || !open) return;
    setLoading(true);
    try {
      const [guRes, svcRes, invRes] = await Promise.all([
        hubGuardiansApi.list(clinicId, true, { status: 'active' }),
        hubServiceTypesApi.list(clinicId, false),
        hubInventoryApi.items.list(clinicId),
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
      { value: '', label: '— Selecionar tutor —' },
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
      { value: '', label: '— Sem pet (só tutor) —' },
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
        const hasCatalog =
          it.item_kind === 'product'
            ? Boolean(it.hub_inventory_item_id)
            : Boolean(it.hub_service_type_id);
        return desc && hasCatalog && parseMoney(it.quantity) > 0;
      }),
    [items],
  );

  const canSubmitBase = Boolean(clinicId && guardianId && unitId && !submitting);

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

  const addNewService = () => {
    const key = `${NEW_ITEM_KEY_PREFIX}svc-${newItemCounterRef.current++}`;
    setItems((prev) => [...prev, { ...newServiceDraft(), id: key }]);
  };

  const addNewProduct = () => {
    const key = `${NEW_ITEM_KEY_PREFIX}prd-${newItemCounterRef.current++}`;
    setItems((prev) => [...prev, { ...newProductDraft(), id: key }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const applyService = (idx: number, serviceTypeId: string) => {
    const st = serviceTypes.find((s) => s.id === serviceTypeId);
    if (!st) return;
    updateItem(idx, {
      hub_service_type_id: st.id,
      description: st.name,
      unit_amount: String(st.sale_amount ?? 0),
      item_kind: 'service',
    });
  };

  const applyProduct = (idx: number, inventoryItemId: string) => {
    const inv = inventoryItems.find((i) => i.id === inventoryItemId);
    if (!inv) return;
    const lot =
      inventoryLots.find((l) => l.item_id === inventoryItemId && Number(l.qty_on_hand ?? 0) > 0) ??
      inventoryLots.find((l) => l.item_id === inventoryItemId);
    updateItem(idx, {
      hub_inventory_item_id: inv.id,
      hub_inventory_lot_id: lot?.id ?? null,
      description: inv.name,
      unit_amount: String(inv.sale_amount ?? 0),
      item_kind: 'product',
    });
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
    if (!clinicId || !guardianId || !unitId) throw new Error('Selecione tutor e unidade.');
    if (readyItems.length === 0) throw new Error('Adicione ao menos um produto ou serviço.');

    const detail = await hubComandaApi.openComanda({
      clinic_id: clinicId,
      origin_type: 'manual',
      guardian_id: guardianId,
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
                guardian_id: guardianId,
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

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title="Venda rápida"
      titleIcon={<ShoppingBag size={20} strokeWidth={1.75} />}
      subtitle="Monte a venda no balcão, escolha o pagamento e finalize sem sair desta tela."
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
            disabled={!canSubmitBase || readyItems.length === 0}
            onClick={() => void handleCheckout()}
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
        <div className="hub-sell-package__form">
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
              placeholder="Buscar tutor…"
              searchPlaceholder="Nome, telefone ou CPF"
              ariaLabel="Tutor"
              triggerIcon={<User size={18} strokeWidth={2} aria-hidden />}
            />
          </div>

          {showQuickCreate ? (
            <div className="hub-sell-package__line-card" style={{ marginBottom: 12 }}>
              <p className="hub-clientes__muted hub-sell-package__hint" style={{ marginTop: 0 }}>
                Cadastro mínimo para venda no balcão. Depois você pode completar a ficha do cliente.
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
              placeholder={guardianId ? 'Sem pet ou escolher…' : 'Escolha o tutor primeiro'}
              searchPlaceholder="Nome do pet"
              ariaLabel="Pet"
              disabled={!guardianId}
              triggerIcon={<Dog size={18} strokeWidth={2} aria-hidden />}
            />
          </div>

          <div className="hub-quick-sale__cart">
            <div className="hub-sell-package__pets-head">
              <h3 className="hub-clientes__section-title" style={{ margin: 0 }}>
                Itens
              </h3>
              <strong>{formatBrl(cartTotal)}</strong>
            </div>
            <ComandaItemsSection
              items={items}
              canEdit
              catalogSearch={catalogSearch}
              onCatalogSearchChange={setCatalogSearch}
              serviceTypes={serviceTypes}
              inventoryItems={inventoryItems}
              inventoryLots={inventoryLots}
              computeLineTotal={computeLineTotal}
              onAddService={addNewService}
              onAddProduct={addNewProduct}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onApplyService={applyService}
              onApplyProduct={applyProduct}
            />
          </div>
        </div>
      )}
    </HubSidePanel>
  );
};
