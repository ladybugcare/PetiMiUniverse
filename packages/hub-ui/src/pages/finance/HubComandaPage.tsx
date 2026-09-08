import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, MessageSquare } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubComandaApi,
  openHubComandaPdf,
  type HubComandaAllowedGuardian,
  type HubComandaDetailResponse,
  type HubComandaEditContext,
  type HubComandaGuardianEmbed,
  type HubComandaPendingPriceApproval,
  type HubComandaPetEmbed,
} from '../../api/hubComandaApi';
import { hubClinicalApi } from '../../api/hubClinicalApi';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading, HubRefreshingBanner } from '../../components/HubLoading';
import { useKeepContentLoad } from '../../hooks/useKeepContentLoad';
import {
  resolveDiscountAmount,
  inferDiscountKindAndValue,
  type DiscountKind,
} from '../../components/billing/DiscountControl';
import { DiscountCard } from '../../components/billing/DiscountCard';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import { HubComandaReceivableDrawer } from './HubComandaReceivableDrawer';
import { ComandaItemsSection } from './ComandaItemsSection';
import HubComandaDetailLayout from './HubComandaDetailLayout';
import {
  apiItemToDraft,
  computeLineTotal,
  NEW_ITEM_KEY_PREFIX,
  newProductDraft,
  newServiceDraft,
  parseMoney,
  round2,
  type ComandaItemDraft,
} from './comandaItemDraft';
import {
  buildWhatsAppMessageComandaLinkVariant,
  formatBrlLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import {
  canSendToFinanceiroHandoff,
  resolveComandaCheckoutCTA,
  resolveSendToFinanceiroConfirmMessage,
} from './hubComandaEditUtils';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import './hub-finance-page.css';
import '../orcamentos/orcamentos-page.css';

function extractGuardian(comanda: Record<string, unknown>): HubComandaGuardianEmbed | null {
  const g = comanda.guardian as HubComandaGuardianEmbed | null | undefined;
  if (!g?.id) return null;
  return g;
}

function extractPets(detail: HubComandaDetailResponse): HubComandaPetEmbed[] {
  if (detail.pets?.length) return detail.pets;
  const p = (detail.comanda as Record<string, unknown>).pet as HubComandaPetEmbed | null | undefined;
  if (p?.id && p.name) return [p];
  return [];
}

export type HubComandaPageMode = 'caixa' | 'financeiro';

export type HubComandaPageProps = {
  mode?: HubComandaPageMode;
  refreshKey?: number;
};

export default function HubComandaPage({ mode = 'caixa', refreshKey = 0 }: HubComandaPageProps) {
  const { id: comandaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editContext: HubComandaEditContext = mode;
  const { hasPermission } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const canWrite = hasPermission('hub.receivables.create');
  const canApprovePrices = hasPermission('hub.financial.write');

  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(comandaId);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<HubComandaDetailResponse | null>(null);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [items, setItems] = useState<ComandaItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [financeNotes, setFinanceNotes] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [discountKind, setDiscountKind] = useState<DiscountKind>('');
  const [discountValueStr, setDiscountValueStr] = useState('0');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceivableDrawer, setShowReceivableDrawer] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [approvingPriceId, setApprovingPriceId] = useState<string | null>(null);

  const newItemCounterRef = useRef(0);

  const comandaRow = payload?.comanda as Record<string, unknown> | undefined;
  const status = String(comandaRow?.status ?? '');
  const guardian = comandaRow ? extractGuardian(comandaRow) : null;
  const pets = payload ? extractPets(payload) : [];
  const allowedGuardians = (payload?.allowed_guardians ?? []) as HubComandaAllowedGuardian[];
  const defaultPetId =
    (comandaRow?.pet_id as string | null | undefined) ??
    (pets.length === 1 ? pets[0].id : null) ??
    null;
  const receivableIds = mode === 'financeiro' ? (payload?.active_receivable_ids ?? []) : [];
  const selectedReceivableId = mode === 'financeiro' ? (searchParams.get('receivable_id') ?? '') : '';

  const onSelectReceivable = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('receivable_id', id);
        return next;
      });
    },
    [setSearchParams],
  );

  const load = useCallback(async () => {
    if (!comandaId || !clinicId) return;
    begin();
    try {
      const [detail, stRes, invRes, lotsRes] = await Promise.all([
        hubComandaApi.getComandaDetail(comandaId, clinicId),
        hubServiceTypesApi.list(clinicId),
        hubInventoryApi.items.list(clinicId).catch(() => ({ items: [] as HubInventoryItem[] })),
        hubInventoryApi.lots.list(clinicId).catch(() => ({ lots: [] as HubInventoryLotRow[] })),
      ]);
      setPayload(detail);
      setServiceTypes(stRes.service_types);
      setInventoryItems(invRes.items ?? []);
      setInventoryLots(lotsRes.lots ?? []);

      const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
      const drafts = (detail.items ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((it) => apiItemToDraft(it, invoicedSet.has(it.id)));
      setItems(drafts);

      const info = detail.comanda as Record<string, unknown>;
      setNotes(String(info.notes ?? ''));
      setFinanceNotes(String(info.finance_notes ?? ''));
      setClientNotes(String(info.client_notes ?? ''));
      const discAmt = Number(info.discount_amount ?? 0);
      const subtotalEst = (detail.items ?? []).reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      const { kind, valueStr } = inferDiscountKindAndValue(discAmt, subtotalEst);
      setDiscountKind(kind);
      setDiscountValueStr(valueStr);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar comanda');
    } finally {
      finish();
    }
  }, [comandaId, clinicId, showError, begin, succeed, finish]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (mode !== 'financeiro' || !payload) return;
    const ids = payload.active_receivable_ids ?? [];
    if (ids.length && !searchParams.get('receivable_id')) {
      onSelectReceivable(ids[0]!);
    }
  }, [mode, payload, searchParams, onSelectReceivable]);

  const summary = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + computeLineTotal(it), 0);
    const discountAmount = resolveDiscountAmount(discountKind, discountValueStr, subtotal);
    const total = round2(Math.max(0, subtotal - discountAmount));
    return { subtotal, discountAmount, total };
  }, [items, discountKind, discountValueStr]);

  const handleTogglePackage = useCallback(
    async (itemId: string, balanceId: string | null) => {
      if (!comandaId || !clinicId) return;
      setSaving(true);
      try {
        const detail = await hubComandaApi.applyPackage(comandaId, {
          clinic_id: clinicId,
          item_id: itemId,
          package_balance_id: balanceId,
          edit_context: editContext,
        });
        setPayload(detail);
        const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
        setItems(
          (detail.items ?? [])
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it) => apiItemToDraft(it, invoicedSet.has(it.id)))
        );
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao aplicar pacote');
      } finally {
        setSaving(false);
      }
    },
    [comandaId, clinicId, editContext, showError]
  );

  const handleApprovePendingPrice = useCallback(
    async (item: HubComandaPendingPriceApproval) => {
      if (!clinicId || !canApprovePrices) return;
      setApprovingPriceId(item.id);
      try {
        if (item.kind === 'surgery_service') {
          await hubClinicalApi.approveSurgeryServicePrice(item.parent_id, item.id, clinicId);
        } else {
          await hubClinicalApi.approveHospitalizationChargePrice(item.parent_id, item.id, clinicId);
        }
        showSuccess('Preço aprovado. A comanda será atualizada.');
        await load();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao aprovar preço');
      } finally {
        setApprovingPriceId(null);
      }
    },
    [clinicId, canApprovePrices, load, showError, showSuccess],
  );

  const packageBalancesByItemId = (payload?.package_balances_by_item_id ?? {}) as Record<
    string,
    Array<{ id: string; sessions_remaining: number; hub_packages?: { name?: string } | { name?: string }[] | null }>
  >;

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

  const removeItem = async (idx: number) => {
    const item = items[idx];
    if (!item || !clinicId || !comandaId) return;

    if (item.invoiced) {
      showError('Este item já foi faturado e não pode ser removido.');
      return;
    }

    if (item.isNew || (item.id && item.id.startsWith(NEW_ITEM_KEY_PREFIX))) {
      setItems((prev) => prev.filter((_, i) => i !== idx));
      return;
    }

    showConfirm('Remover item da comanda?', async () => {
      try {
        const detail = await hubComandaApi.deleteItem(comandaId, item.id!, clinicId, editContext);
        setPayload(detail);
        const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
        setItems(
          (detail.items ?? [])
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it) => apiItemToDraft(it, invoicedSet.has(it.id))),
        );
        showSuccess('Item removido.');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao remover item');
      }
    });
  };

  const persistComanda = async () => {
    if (!clinicId || !comandaId || !canWrite) return;

    const newItems = items.filter((it) => it.isNew || (it.id && it.id.startsWith(NEW_ITEM_KEY_PREFIX)));
    if (newItems.length > 0) {
      await hubComandaApi.addItems(comandaId, {
        clinic_id: clinicId,
        edit_context: editContext,
        items: newItems.map((it) => {
          const isProduct = it.item_kind === 'product';
          const serviceName = it.hub_service_type_id
            ? serviceTypes.find((s) => s.id === it.hub_service_type_id)?.name
            : null;
          return {
            description: isProduct
              ? it.description || inventoryItems.find((p) => p.id === it.hub_inventory_item_id)?.name || 'Produto'
              : serviceName || it.description || 'Serviço',
            quantity: parseMoney(it.quantity) || 1,
            unit_amount: parseMoney(it.unit_amount),
            discount_amount: parseMoney(it.discount_amount),
            hub_service_type_id: isProduct ? undefined : it.hub_service_type_id ?? undefined,
            hub_inventory_item_id: isProduct ? it.hub_inventory_item_id ?? undefined : undefined,
            hub_inventory_lot_id: isProduct ? it.hub_inventory_lot_id ?? undefined : undefined,
            item_kind: isProduct ? ('product' as const) : ('service' as const),
            ...(defaultPetId ? { pet_id: defaultPetId } : {}),
          };
        }),
      });
    }

    const existingEdited = items.filter(
      (it) => it.id && !it.id.startsWith(NEW_ITEM_KEY_PREFIX) && !it.isNew && !it.invoiced,
    );
    for (const it of existingEdited) {
      await hubComandaApi.patchItem(comandaId, it.id!, {
        clinic_id: clinicId,
        edit_context: editContext,
        quantity: parseMoney(it.quantity) || 1,
        unit_amount: parseMoney(it.unit_amount),
        discount_amount: parseMoney(it.discount_amount),
        ...(it.origin_type === 'manual' ? { description: it.description } : {}),
      });
    }

    const discountAmount = resolveDiscountAmount(discountKind, discountValueStr, summary.subtotal);
    return hubComandaApi.updateComanda(comandaId, {
      clinic_id: clinicId,
      edit_context: editContext,
      discount_amount: discountAmount,
      ...(editContext === 'caixa' ? { notes: notes.trim() || null } : {}),
      ...(editContext === 'financeiro' ? { finance_notes: financeNotes.trim() || null } : {}),
      client_notes: clientNotes.trim() || null,
    });
  };

  const handleSave = async () => {
    if (!clinicId || !comandaId || !canWrite) return;
    setSaving(true);
    try {
      const detail = await persistComanda();
      if (detail) {
        setPayload(detail);
        const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
        setItems(
          (detail.items ?? [])
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((it) => apiItemToDraft(it, invoicedSet.has(it.id))),
        );
      }
      showSuccess('Comanda salva.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSendToFinancial = () => {
    if (!clinicId || !comandaId || !canWrite || !payload) return;
    const confirmMessage = resolveSendToFinanceiroConfirmMessage({
      ...payload,
      finance_handoff_at: financeHandoffAt,
    });
    showConfirm(confirmMessage, async () => {
      setSaving(true);
      try {
        await persistComanda();
        const dueDate = new Date().toISOString().slice(0, 10);
        await hubComandaApi.checkout(comandaId, {
          clinic_id: clinicId,
          grouping: 'all',
          action: 'leave_pending',
          due_date: dueDate,
        });
        showSuccess('Comanda enviada ao financeiro.');
        navigate(`/hub/financeiro/comanda/${comandaId}`);
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao enviar ao financeiro');
      } finally {
        setSaving(false);
      }
    });
  };

  const handleGuardianChange = async (guardianId: string) => {
    if (!clinicId || !comandaId || !canWrite) return;
    setSaving(true);
    try {
      const detail = await hubComandaApi.updateComanda(comandaId, {
        clinic_id: clinicId,
        edit_context: editContext,
        guardian_id: guardianId,
      });
      setPayload(detail);
      showSuccess('Tutor de cobrança atualizado.');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao trocar tutor');
    } finally {
      setSaving(false);
    }
  };

  const ensurePublicUrl = async (): Promise<string> => {
    if (!clinicId || !comandaId) throw new Error('Comanda inválida');
    const { public_token } = await hubComandaApi.ensurePublicToken(comandaId, clinicId);
    return hubComandaApi.publicLink(public_token);
  };

  const copyPublicLink = async () => {
    try {
      const url = await ensurePublicUrl();
      await navigator.clipboard.writeText(url);
      showSuccess('Link público copiado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao gerar link');
    }
  };

  const openPublicComanda = async () => {
    try {
      const url = await ensurePublicUrl();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir link público');
    }
  };

  const shareWhatsAppWithMessage = async () => {
    if (!guardian) return;
    try {
      const publicUrl = await ensurePublicUrl();
      const firstName = guardianFirstName(guardian.full_name);
      const msg = buildWhatsAppMessageComandaLinkVariant(firstName, publicUrl, formatBrlLabel(summary.total));
      const waUrl = waMeUrlWithText(guardian.phone, msg);
      if (!waUrl) {
        showError('Cadastre um telefone válido no tutor.');
        return;
      }
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao preparar WhatsApp');
    }
  };

  const openPdf = async () => {
    if (!clinicId || !comandaId) return;
    try {
      await openHubComandaPdf(comandaId, clinicId);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    }
  };

  const applyServiceToItem = useCallback(
    async (idx: number, serviceTypeId: string) => {
      if (!serviceTypeId || !clinicId) {
        updateItem(idx, { hub_service_type_id: null, description: '' });
        return;
      }
      try {
        const res = await hubComandaApi.suggestItemPrice({
          clinic_id: clinicId,
          hub_service_type_id: serviceTypeId,
          pet: { size_tier: 'medio', birth_date: null, coat_type: null },
        });
        updateItem(idx, {
          hub_service_type_id: serviceTypeId,
          description: '',
          unit_amount: String(res.unit_price ?? 0),
        });
      } catch {
        updateItem(idx, { hub_service_type_id: serviceTypeId, description: '' });
      }
    },
    [clinicId],
  );

  const applyProductToItem = useCallback(
    (idx: number, inventoryItemId: string) => {
      if (!inventoryItemId) {
        updateItem(idx, {
          hub_inventory_item_id: null,
          hub_inventory_lot_id: null,
          description: '',
          unit_amount: '0',
        });
        return;
      }
      const product = inventoryItems.find((p) => p.id === inventoryItemId);
      updateItem(idx, {
        hub_inventory_item_id: inventoryItemId,
        hub_inventory_lot_id: null,
        description: product?.name ?? '',
        unit_amount: String(product?.sale_amount ?? 0),
      });
    },
    [inventoryItems],
  );

  const isAberta = status === 'aberta';
  const canEdit = Boolean(payload?.edit_scopes?.[editContext] ?? (isAberta && canWrite));
  const lockedReason = payload?.edit_scopes?.locked_reason ?? null;
  const financeHandoffAt = comandaRow?.finance_handoff_at as string | null | undefined;
  const canEditCaixaNotes = canEdit && mode === 'caixa' && !financeHandoffAt;
  const canEditFinanceNotes = canEdit && mode === 'financeiro' && Boolean(financeHandoffAt);
  const showFinanceNotesSection = Boolean(financeHandoffAt) || financeNotes.trim().length > 0;

  const checkoutCta = useMemo(
    () => (payload ? resolveComandaCheckoutCTA(mode, payload) : { kind: 'none' as const }),
    [mode, payload],
  );

  const showSendToFinanceiro = useMemo(
    () =>
      mode === 'caixa' &&
      canEdit &&
      Boolean(payload && canSendToFinanceiroHandoff({ ...payload, finance_handoff_at: financeHandoffAt })),
    [mode, canEdit, payload, financeHandoffAt],
  );

  const checkoutLabel =
    checkoutCta.kind === 'checkout_drawer' || checkoutCta.kind === 'receivable_drawer'
      ? checkoutCta.label
      : undefined;

  const handleCheckout = useCallback(() => {
    if (checkoutCta.kind === 'checkout_drawer') {
      setShowCheckout(true);
      return;
    }
    if (checkoutCta.kind === 'receivable_drawer') {
      setShowReceivableDrawer(true);
    }
  }, [checkoutCta.kind]);

  const highlightReceivablePayment =
    showReceivableDrawer &&
    checkoutCta.kind === 'receivable_drawer' &&
    checkoutCta.label === 'Registrar pagamento';

  const readOnlyBanner = useMemo(() => {
    if (canEdit || !lockedReason) return null;
    if (lockedReason === 'finance_handoff' && mode === 'caixa') {
      return (
        <>
          Esta comanda foi enviada ao financeiro. Edite e cobre em{' '}
          <Link to={`/hub/financeiro/comanda/${comandaId}`}>Financeiro</Link>.
        </>
      );
    }
    if (lockedReason === 'paid_and_complete') {
      return (
        <>
          Comanda quitada e serviço concluído. Alterações de valor via estorno no{' '}
          <Link to={`/hub/financeiro/comanda/${comandaId}`}>Financeiro</Link>.
        </>
      );
    }
    return null;
  }, [canEdit, lockedReason, mode, comandaId]);

  if (!clinicId || !unitId) {
    return (
      <div className="hub-quote-detail" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>
      </div>
    );
  }

  if (!payload || !comandaRow || !comandaId) {
    if (loading) {
      return (
        <div className="hub-quote-detail" style={{ padding: 24 }}>
          <HubLoading variant="block" label="Carregando comanda…" />
        </div>
      );
    }
    return (
      <div className="hub-quote-detail" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Comanda não encontrada.</p>
      </div>
    );
  }

  const itemsSection = (
    <ComandaItemsSection
      items={items}
      canEdit={canEdit}
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
      onApplyService={applyServiceToItem}
      onApplyProduct={applyProductToItem}
      packageBalancesByItemId={packageBalancesByItemId}
      onTogglePackage={String(comandaRow?.origin_type) !== 'package' ? handleTogglePackage : undefined}
      pendingPriceApprovals={payload.pending_price_approvals ?? []}
      canApprovePrices={canApprovePrices}
      approvingPriceId={approvingPriceId}
      onApprovePrice={(item) => void handleApprovePendingPrice(item)}
    />
  );

  const notesSection = (
    <>
      <section className="hub-quote-detail__card">
        <div className="hub-quote-detail__card-head hub-quote-detail__card-head--with-sub">
          <MessageSquare size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
          <div>
            <h2 className="hub-quote-detail__card-title">Observação para o cliente</h2>
            <p className="hub-orcamento-novo__card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
              Visível no PDF e no link público da comanda.
            </p>
          </div>
        </div>
        <textarea
          className="hub-orcamento-novo__textarea hub-orcamento-novo__textarea--client"
          rows={4}
          maxLength={200}
          value={clientNotes}
          onChange={(e) => setClientNotes(e.target.value)}
          placeholder="Ex.: intercorrência no banho, orientação de retirada, item substituído…"
          disabled={!canEdit}
        />
        <p className="hub-orcamento-novo__char-count">{clientNotes.length}/200</p>
      </section>

      <section className="hub-quote-detail__card">
        <div className="hub-quote-detail__card-head hub-quote-detail__card-head--with-sub">
          <Lock size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
          <div>
            <h2 className="hub-quote-detail__card-title">Observação interna do caixa</h2>
            <p className="hub-orcamento-novo__card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
              {financeHandoffAt
                ? 'Histórico — não pode mais ser alterada após o envio ao financeiro.'
                : 'Apenas a equipe vê. Fica registrada ao enviar ao financeiro.'}
            </p>
          </div>
        </div>
        <textarea
          className="hub-orcamento-novo__textarea"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: combinar desconto na retirada, orientações para a recepção…"
          disabled={!canEditCaixaNotes}
          readOnly={!canEditCaixaNotes}
        />
        <p className="hub-orcamento-novo__char-count">{notes.length}/2000</p>
      </section>

      {showFinanceNotesSection ? (
        <section className="hub-quote-detail__card">
          <div className="hub-quote-detail__card-head hub-quote-detail__card-head--with-sub">
            <Lock size={20} strokeWidth={1.75} className="hub-quote-detail__card-ic" aria-hidden />
            <div>
              <h2 className="hub-quote-detail__card-title">Observação interna do financeiro</h2>
              <p className="hub-orcamento-novo__card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
                {mode === 'financeiro'
                  ? 'Anotações da cobrança e do acompanhamento financeiro.'
                  : 'Registrada pelo financeiro após o recebimento da comanda.'}
              </p>
            </div>
          </div>
          <textarea
            className="hub-orcamento-novo__textarea"
            rows={3}
            maxLength={2000}
            value={financeNotes}
            onChange={(e) => setFinanceNotes(e.target.value)}
            placeholder="Ex.: acordo de parcelamento, follow-up de cobrança…"
            disabled={!canEditFinanceNotes}
            readOnly={!canEditFinanceNotes}
          />
          <p className="hub-orcamento-novo__char-count">{financeNotes.length}/2000</p>
        </section>
      ) : null}
    </>
  );

  const sidebarActions =
    canEdit ? (
      <DiscountCard
        idPrefix="comanda"
        kind={discountKind}
        valueStr={discountValueStr}
        onKindChange={setDiscountKind}
        onValueStrChange={setDiscountValueStr}
        disabled={saving}
      />
    ) : null;

  return (
    <>
      <HubRefreshingBanner show={refreshing} label="Atualizando comanda…" />
      <HubComandaDetailLayout
        comandaId={comandaId}
        status={status}
        openedAt={comandaRow.opened_at as string | null}
        closedAt={comandaRow.closed_at as string | null}
        guardian={guardian}
        pets={pets}
        allowedGuardians={allowedGuardians}
        subtotal={summary.subtotal}
        discountAmount={summary.discountAmount}
        total={summary.total}
        paidTotal={payload.paid_total}
        balanceDue={payload.balance_due}
        events={payload.events ?? []}
        canWrite={canWrite}
        canEdit={canEdit}
        saving={saving}
        isAberta={isAberta}
        mode={mode}
        readOnlyBanner={readOnlyBanner}
        selectedGuardianId={guardian?.id ?? null}
        onGuardianChange={allowedGuardians.length > 1 ? (id) => void handleGuardianChange(id) : undefined}
        onSave={() => void handleSave()}
        onCheckout={
          canEdit &&
          (checkoutCta.kind === 'checkout_drawer' || checkoutCta.kind === 'receivable_drawer')
            ? handleCheckout
            : undefined
        }
        checkoutLabel={checkoutLabel}
        onSendToFinancial={showSendToFinanceiro ? handleSendToFinancial : undefined}
        onOpenPdf={() => void openPdf()}
        onCopyPublic={() => void copyPublicLink()}
        onShareOpenPublic={() => void openPublicComanda()}
        onShareWhatsAppWithMessage={() => void shareWhatsAppWithMessage()}
        itemsSection={itemsSection}
        notesSection={notesSection}
        sidebarActions={sidebarActions}
      />

      {showReceivableDrawer && mode === 'financeiro' && comandaId && (
        <HubComandaReceivableDrawer
          open={showReceivableDrawer}
          onClose={() => setShowReceivableDrawer(false)}
          comandaId={comandaId}
          receivableIds={receivableIds}
          selectedReceivableId={selectedReceivableId}
          onSelectReceivable={onSelectReceivable}
          onRefreshComanda={() => void load()}
          highlightPayment={highlightReceivablePayment}
        />
      )}

      {showCheckout && clinicId && unitId && (
        <ComandaCheckoutDrawer
          mode={mode}
          open={showCheckout}
          onClose={() => setShowCheckout(false)}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={comandaId}
          onSuccess={({ comandaId, kind, receivableIds }) => {
            setShowCheckout(false);
            void load();
            if (mode === 'financeiro') {
              const rid = receivableIds[0];
              navigate(
                rid
                  ? `/hub/financeiro/comanda/${comandaId}?receivable_id=${rid}`
                  : `/hub/financeiro/comanda/${comandaId}`,
              );
              return;
            }
            if (kind === 'leave_pending') {
              const rid = receivableIds[0];
              navigate(
                rid
                  ? `/hub/financeiro/comanda/${comandaId}?receivable_id=${rid}`
                  : `/hub/financeiro/comanda/${comandaId}`,
              );
              return;
            }
            navigate('/hub/caixa');
          }}
        />
      )}
    </>
  );
}
