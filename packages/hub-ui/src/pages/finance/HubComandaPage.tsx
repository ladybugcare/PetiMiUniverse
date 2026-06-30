import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubComandaApi,
  openHubComandaPdf,
  type HubComandaAllowedGuardian,
  type HubComandaDetailResponse,
  type HubComandaEditContext,
  type HubComandaGuardianEmbed,
  type HubComandaPetEmbed,
} from '../../api/hubComandaApi';
import { hubInventoryApi, type HubInventoryItem, type HubInventoryLotRow } from '../../api/hubInventoryApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  DiscountControl,
  resolveDiscountAmount,
  inferDiscountKindAndValue,
  type DiscountKind,
} from '../../components/billing/DiscountControl';
import { FinancialSummaryCard } from '../../components/billing/FinancialSummaryCard';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
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
  financePanel?: React.ReactNode;
  onDetailLoaded?: (detail: HubComandaDetailResponse) => void;
  refreshKey?: number;
};

export default function HubComandaPage({ mode = 'caixa', financePanel, onDetailLoaded, refreshKey = 0 }: HubComandaPageProps) {
  const { id: comandaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editContext: HubComandaEditContext = mode;
  const { hasPermission } = usePermissions();
  const { showError, showSuccess, showConfirm } = useAlert();
  const clinicId = getStoredClinicId();
  const unitId = useSelectedUnitId();

  const canWrite = hasPermission('hub.receivables.create');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState<HubComandaDetailResponse | null>(null);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [inventoryItems, setInventoryItems] = useState<HubInventoryItem[]>([]);
  const [inventoryLots, setInventoryLots] = useState<HubInventoryLotRow[]>([]);
  const [items, setItems] = useState<ComandaItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [discountKind, setDiscountKind] = useState<DiscountKind>('');
  const [discountValueStr, setDiscountValueStr] = useState('0');
  const [showCheckout, setShowCheckout] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  const newItemCounterRef = useRef(0);

  const comandaRow = payload?.comanda as Record<string, unknown> | undefined;
  const status = String(comandaRow?.status ?? '');
  const guardian = comandaRow ? extractGuardian(comandaRow) : null;
  const pets = payload ? extractPets(payload) : [];
  const allowedGuardians = (payload?.allowed_guardians ?? []) as HubComandaAllowedGuardian[];

  const load = useCallback(async () => {
    if (!comandaId || !clinicId) return;
    setLoading(true);
    try {
      const [detail, stRes, invRes, lotsRes] = await Promise.all([
        hubComandaApi.getComandaDetail(comandaId, clinicId),
        hubServiceTypesApi.list(clinicId),
        hubInventoryApi.items.list(clinicId).catch(() => ({ items: [] as HubInventoryItem[] })),
        hubInventoryApi.lots.list(clinicId).catch(() => ({ lots: [] as HubInventoryLotRow[] })),
      ]);
      setPayload(detail);
      onDetailLoaded?.(detail);
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
      const discAmt = Number(info.discount_amount ?? 0);
      const subtotalEst = (detail.items ?? []).reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      const { kind, valueStr } = inferDiscountKindAndValue(discAmt, subtotalEst);
      setDiscountKind(kind);
      setDiscountValueStr(valueStr);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar comanda');
    } finally {
      setLoading(false);
    }
  }, [comandaId, clinicId, showError, onDetailLoaded]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const summary = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + computeLineTotal(it), 0);
    const discountAmount = resolveDiscountAmount(discountKind, discountValueStr, subtotal);
    const total = round2(Math.max(0, subtotal - discountAmount));
    return { subtotal, discountAmount, total };
  }, [items, discountKind, discountValueStr]);

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
      notes: notes.trim() || null,
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
    if (!clinicId || !comandaId || !canWrite) return;
    showConfirm('Enviar comanda ao financeiro? Os itens ficarão como recebíveis pendentes.', async () => {
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

  if (loading) {
    return (
      <div className="hub-quote-detail" style={{ padding: 24 }}>
        <HubLoading variant="block" label="Carregando comanda…" />
      </div>
    );
  }

  if (!payload || !comandaRow || !comandaId) {
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
    />
  );

  const notesSection = (
    <section className="hub-quote-detail__card hub-quote-detail__card--internal">
      <h2 className="hub-quote-detail__card-title">Observação interna</h2>
      <textarea
        className="hub-orcamento-novo__textarea"
        rows={3}
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Apenas a equipe vê"
        disabled={!canEdit}
      />
      <p className="hub-orcamento-novo__char-count">{notes.length}/2000</p>
    </section>
  );

  const sidebarActions =
    canEdit ? (
      <FinancialSummaryCard
        subtotal={summary.subtotal}
        discountAmount={summary.discountAmount}
        total={summary.total}
        discountControl={
          <DiscountControl
            idPrefix="comanda"
            kind={discountKind}
            valueStr={discountValueStr}
            onKindChange={setDiscountKind}
            onValueStrChange={setDiscountValueStr}
            disabled={saving}
          />
        }
      />
    ) : null;

  return (
    <>
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
        canWrite={canWrite}
        canEdit={canEdit}
        saving={saving}
        isAberta={isAberta}
        mode={mode}
        readOnlyBanner={readOnlyBanner}
        selectedGuardianId={guardian?.id ?? null}
        onGuardianChange={allowedGuardians.length > 1 ? (id) => void handleGuardianChange(id) : undefined}
        onSave={() => void handleSave()}
        onCheckout={canEdit && (payload?.balance_due ?? 0) > 0.009 ? () => setShowCheckout(true) : undefined}
        onSendToFinancial={mode === 'caixa' ? handleSendToFinancial : undefined}
        onOpenPdf={() => void openPdf()}
        onCopyPublic={() => void copyPublicLink()}
        onShareOpenPublic={() => void openPublicComanda()}
        onShareWhatsAppWithMessage={() => void shareWhatsAppWithMessage()}
        itemsSection={itemsSection}
        notesSection={notesSection}
        sidebarActions={sidebarActions}
        financePanel={financePanel}
      />

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
