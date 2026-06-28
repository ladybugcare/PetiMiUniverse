import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FilePlus2, Search, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import {
  hubComandaApi,
  openHubComandaPdf,
  type HubComandaAllowedGuardian,
  type HubComandaDetailResponse,
  type HubComandaEditContext,
  type HubComandaGuardianEmbed,
  type HubComandaItem,
} from '../../api/hubComandaApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  DiscountControl,
  resolveDiscountAmount,
  inferDiscountKindAndValue,
  type DiscountKind,
} from '../../components/billing/DiscountControl';
import { FinancialSummaryCard } from '../../components/billing/FinancialSummaryCard';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
import HubComandaDetailLayout from './HubComandaDetailLayout';
import {
  buildWhatsAppMessageComandaLinkVariant,
  formatBrlLabel,
  guardianFirstName,
  waMeUrlWithText,
} from './hubComandaShareUtils';
import { useSelectedUnitId } from '../../utils/useSelectedUnitId';
import './hub-finance-page.css';
import '../orcamentos/orcamentos-page.css';

function fmtBrl(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseMoney(s: string): number {
  const n = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ItemDraft = {
  id: string | null;
  description: string;
  quantity: string;
  unit_amount: string;
  discount_amount: string;
  line_total: number;
  origin_type: string | null;
  pet_name: string | null;
  hub_service_type_id: string | null;
  invoiced: boolean;
  isNew?: boolean;
};

function apiItemToDraft(item: HubComandaItem, invoiced: boolean): ItemDraft {
  return {
    id: item.id,
    description: item.description,
    quantity: String(item.quantity),
    unit_amount: String(item.unit_amount),
    discount_amount: String(item.discount_amount),
    line_total: item.line_total,
    origin_type: item.origin_type ?? null,
    pet_name: item.pet_name ?? null,
    hub_service_type_id: item.hub_service_type_id ?? null,
    invoiced,
  };
}

function computeLineTotal(d: ItemDraft): number {
  const qty = parseMoney(d.quantity);
  const unit = parseMoney(d.unit_amount);
  const disc = parseMoney(d.discount_amount);
  return round2(Math.max(0, qty * unit - disc));
}

const NEW_ITEM_KEY_PREFIX = 'new-';

function newItemDraft(): ItemDraft {
  return {
    id: null,
    description: '',
    quantity: '1',
    unit_amount: '0',
    discount_amount: '0',
    line_total: 0,
    origin_type: 'manual',
    pet_name: null,
    hub_service_type_id: null,
    invoiced: false,
    isNew: true,
  };
}

function extractGuardian(comanda: Record<string, unknown>): HubComandaGuardianEmbed | null {
  const g = comanda.guardian as HubComandaGuardianEmbed | null | undefined;
  if (!g?.id) return null;
  return g;
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
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [discountKind, setDiscountKind] = useState<DiscountKind>('');
  const [discountValueStr, setDiscountValueStr] = useState('0');
  const [showCheckout, setShowCheckout] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');

  const newItemCounterRef = useRef(0);

  const comandaRow = payload?.comanda as Record<string, unknown> | undefined;
  const status = String(comandaRow?.status ?? '');
  const guardian = comandaRow ? extractGuardian(comandaRow) : null;
  const allowedGuardians = (payload?.allowed_guardians ?? []) as HubComandaAllowedGuardian[];

  const load = useCallback(async () => {
    if (!comandaId || !clinicId) return;
    setLoading(true);
    try {
      const [detail, stRes] = await Promise.all([
        hubComandaApi.getComandaDetail(comandaId, clinicId),
        hubServiceTypesApi.list(clinicId),
      ]);
      setPayload(detail);
      onDetailLoaded?.(detail);
      setServiceTypes(stRes.service_types);

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

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.line_total = computeLineTotal(next);
        return next;
      }),
    );
  };

  const addNewItem = () => {
    const key = `${NEW_ITEM_KEY_PREFIX}${newItemCounterRef.current++}`;
    setItems((prev) => [...prev, { ...newItemDraft(), id: key }]);
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
        items: newItems.map((it) => ({
          description: it.description || 'Serviço',
          quantity: parseMoney(it.quantity) || 1,
          unit_amount: parseMoney(it.unit_amount),
          discount_amount: parseMoney(it.discount_amount),
          hub_service_type_id: it.hub_service_type_id ?? undefined,
          item_kind: 'service' as const,
        })),
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

  const serviceComboOptions = useMemo((): HubComboboxOption[] => {
    const q = serviceSearch.trim().toLowerCase();
    const active = serviceTypes.filter((s) => !s.deleted_at && s.active !== false && !s.is_addon);
    const filtered = q ? active.filter((s) => s.name.toLowerCase().includes(q)) : active;
    return [
      { value: '', label: '— Selecionar serviço —' },
      ...filtered.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [serviceTypes, serviceSearch]);

  const applyServiceToItem = useCallback(
    async (idx: number, serviceTypeId: string) => {
      if (!serviceTypeId || !clinicId) {
        updateItem(idx, { hub_service_type_id: null });
        return;
      }
      const st = serviceTypes.find((s) => s.id === serviceTypeId);
      const desc = st?.name ?? '';
      try {
        const res = await hubComandaApi.suggestItemPrice({
          clinic_id: clinicId,
          hub_service_type_id: serviceTypeId,
          pet: { size_tier: 'medio', birth_date: null, coat_type: null },
        });
        updateItem(idx, {
          hub_service_type_id: serviceTypeId,
          description: desc,
          unit_amount: String(res.unit_price ?? 0),
        });
      } catch {
        updateItem(idx, { hub_service_type_id: serviceTypeId, description: desc });
      }
    },
    [clinicId, serviceTypes],
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
        <p className="hub-clientes__muted">Carregando…</p>
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
    <>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="hub-orcamento-novo__services-search-wrap" style={{ minWidth: 180, flex: 1 }}>
            <Search size={15} className="hub-orcamento-novo__services-search-icon" aria-hidden />
            <input
              type="search"
              className="hub-orcamento-novo__input hub-orcamento-novo__services-search-input"
              placeholder="Buscar serviço"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              aria-label="Buscar serviço"
            />
          </div>
          <button
            type="button"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
            onClick={addNewItem}
          >
            <FilePlus2 size={15} />
            Adicionar item
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <p className="hub-quote-detail__muted">Nenhum item na comanda.</p>
      ) : (
        <div className="hub-quote-detail__table-scroll">
          <table className="hub-orcamento-novo__services-table hub-quote-detail__svc-table">
            <thead>
              <tr>
                <th>Descrição / Serviço</th>
                <th>Pet</th>
                <th className="right">Qtd</th>
                <th className="right">Valor unit.</th>
                <th className="right">Desconto</th>
                <th className="right">Total linha</th>
                {canEdit && <th aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const editable = canEdit && !it.invoiced;
                const isManual = it.origin_type === 'manual' || it.origin_type === 'manual_line';
                return (
                  <tr key={it.id ?? `new-${idx}`} className={it.invoiced ? 'hub-comanda-row--invoiced' : ''}>
                    <td style={{ minWidth: 200 }}>
                      {editable && it.isNew ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <HubSearchableCombobox
                            id={`comanda-svc-${idx}`}
                            className="hub-orcamento-novo__combobox hub-orcamento-novo__service-combobox"
                            options={serviceComboOptions}
                            value={it.hub_service_type_id ?? ''}
                            onChange={(v) => void applyServiceToItem(idx, v)}
                            placeholder="— Selecionar serviço —"
                            searchPlaceholder="Buscar serviço…"
                            ariaLabel="Serviço"
                          />
                          <input
                            className="hub-orcamento-novo__input"
                            placeholder="Ou digitar descrição livre"
                            value={it.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                          />
                        </div>
                      ) : editable && isManual ? (
                        <input
                          className="hub-orcamento-novo__input"
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                        />
                      ) : (
                        <span title={it.origin_type ?? undefined}>{it.description}</span>
                      )}
                    </td>
                    <td className="hub-orcamento-novo__services-table-cell--muted">{it.pet_name ?? '—'}</td>
                    <td className="right" style={{ minWidth: 64 }}>
                      {editable ? (
                        <input
                          className="hub-orcamento-novo__input"
                          style={{ textAlign: 'right', maxWidth: 64 }}
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        />
                      ) : (
                        it.quantity
                      )}
                    </td>
                    <td className="right" style={{ minWidth: 96 }}>
                      {editable ? (
                        <input
                          className="hub-orcamento-novo__input"
                          style={{ textAlign: 'right', maxWidth: 96 }}
                          value={it.unit_amount}
                          onChange={(e) => updateItem(idx, { unit_amount: e.target.value })}
                        />
                      ) : (
                        fmtBrl(Number(it.unit_amount))
                      )}
                    </td>
                    <td className="right" style={{ minWidth: 96 }}>
                      {editable ? (
                        <input
                          className="hub-orcamento-novo__input"
                          style={{ textAlign: 'right', maxWidth: 96 }}
                          value={it.discount_amount}
                          onChange={(e) => updateItem(idx, { discount_amount: e.target.value })}
                        />
                      ) : (
                        fmtBrl(Number(it.discount_amount))
                      )}
                    </td>
                    <td className="right" style={{ fontWeight: 500 }}>
                      {fmtBrl(computeLineTotal(it))}
                    </td>
                    {canEdit && (
                      <td>
                        {it.invoiced ? (
                          <span className="hub-orcamento-novo__services-table-cell--muted" style={{ fontSize: 11 }}>
                            Faturado
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost hub-orcamento-novo__btn--icon"
                            aria-label="Remover item"
                            onClick={() => void removeItem(idx)}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
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
