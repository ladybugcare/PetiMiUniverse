import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Coins, FilePlus2, Search, Send, Trash2 } from 'lucide-react';
import { usePermissions, getStoredClinicId } from '@petimi/web-core';
import { hubComandaApi, type HubComandaDetailResponse, type HubComandaItem } from '../../api/hubComandaApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { DiscountControl, resolveDiscountAmount, inferDiscountKindAndValue, type DiscountKind } from '../../components/billing/DiscountControl';
import { FinancialSummaryCard } from '../../components/billing/FinancialSummaryCard';
import { ComandaCheckoutDrawer } from './ComandaCheckoutDrawer';
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
  /** null = item novo (não persistido) */
  id: string | null;
  description: string;
  quantity: string;
  unit_amount: string;
  discount_amount: string;
  line_total: number;
  origin_type: string | null;
  pet_name: string | null;
  hub_service_type_id: string | null;
  /** Item já está em receivable_lines (faturado). */
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

interface ComandaHeaderInfo {
  status: string;
  guardian_name?: string | null;
  pet_name?: string | null;
  total_amount?: number;
  discount_amount?: number;
  notes?: string | null;
}

function extractComandaInfo(comanda: Record<string, unknown>): ComandaHeaderInfo {
  return {
    status: String(comanda.status ?? ''),
    guardian_name: comanda.guardian_name as string | null,
    pet_name: comanda.pet_name as string | null,
    total_amount: Number(comanda.total_amount ?? 0),
    discount_amount: Number(comanda.discount_amount ?? 0),
    notes: comanda.notes as string | null,
  };
}

export default function HubComandaPage() {
  const { id: comandaId } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  const comandaInfo = useMemo(() => {
    if (!payload?.comanda) return null;
    return extractComandaInfo(payload.comanda);
  }, [payload]);

  const load = useCallback(async () => {
    if (!comandaId || !clinicId) return;
    setLoading(true);
    try {
      const [detail, stRes] = await Promise.all([
        hubComandaApi.getComandaDetail(comandaId, clinicId),
        hubServiceTypesApi.list(clinicId),
      ]);
      setPayload(detail);
      setServiceTypes(stRes.service_types);

      const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
      const drafts = (detail.items ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((it) => apiItemToDraft(it, invoicedSet.has(it.id)));
      setItems(drafts);

      const info = extractComandaInfo(detail.comanda);
      setNotes(info.notes ?? '');
      const discAmt = info.discount_amount ?? 0;
      const subtotalEst = (detail.items ?? []).reduce((s, it) => s + Number(it.line_total ?? 0), 0);
      const { kind, valueStr } = inferDiscountKindAndValue(discAmt, subtotalEst);
      setDiscountKind(kind);
      setDiscountValueStr(valueStr);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar comanda');
    } finally {
      setLoading(false);
    }
  }, [comandaId, clinicId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

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
        const detail = await hubComandaApi.deleteItem(comandaId, item.id!, clinicId);
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

  const handleSave = async () => {
    if (!clinicId || !comandaId || !canWrite) return;
    setSaving(true);
    try {
      // 1. Persistir itens novos (não têm id real)
      const newItems = items.filter((it) => it.isNew || (it.id && it.id.startsWith(NEW_ITEM_KEY_PREFIX)));
      if (newItems.length > 0) {
        await hubComandaApi.addItems(comandaId, {
          clinic_id: clinicId,
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

      // 2. Persistir edições em itens existentes
      const existingEdited = items.filter(
        (it) => it.id && !it.id.startsWith(NEW_ITEM_KEY_PREFIX) && !it.isNew && !it.invoiced,
      );
      for (const it of existingEdited) {
        await hubComandaApi.patchItem(comandaId, it.id!, {
          clinic_id: clinicId,
          quantity: parseMoney(it.quantity) || 1,
          unit_amount: parseMoney(it.unit_amount),
          discount_amount: parseMoney(it.discount_amount),
          ...(it.origin_type === 'manual' ? { description: it.description } : {}),
        });
      }

      // 3. Atualizar desconto global + notas
      const discountAmount = resolveDiscountAmount(discountKind, discountValueStr, summary.subtotal);
      const detail = await hubComandaApi.updateComanda(comandaId, {
        clinic_id: clinicId,
        discount_amount: discountAmount,
        notes: notes.trim() || null,
      });

      setPayload(detail);
      const invoicedSet = new Set(detail.invoiced_item_ids ?? []);
      setItems(
        (detail.items ?? [])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((it) => apiItemToDraft(it, invoicedSet.has(it.id))),
      );
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
        const discountAmount = resolveDiscountAmount(discountKind, discountValueStr, summary.subtotal);
        await hubComandaApi.updateComanda(comandaId, {
          clinic_id: clinicId,
          discount_amount: discountAmount,
          notes: notes.trim() || null,
        });

        await hubComandaApi.checkout(comandaId, {
          clinic_id: clinicId,
          grouping: 'all',
          action: 'leave_pending',
        });
        showSuccess('Comanda enviada ao financeiro.');
        navigate('/hub/caixa');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao enviar ao financeiro');
      } finally {
        setSaving(false);
      }
    });
  };

  // Serviços disponíveis para o combobox de adição
  const serviceComboOptions = useMemo((): HubComboboxOption[] => {
    const q = serviceSearch.trim().toLowerCase();
    const active = serviceTypes.filter(
      (s) => !s.deleted_at && s.active !== false && !s.is_addon,
    );
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

  const isAberta = comandaInfo?.status === 'aberta';

  if (!clinicId || !unitId) {
    return (
      <div className="hub-orcamento-novo">
        <p className="hub-clientes__muted">Selecione a unidade para continuar.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="hub-orcamento-novo">
        <p className="hub-clientes__muted">Carregando…</p>
      </div>
    );
  }

  if (!payload || !comandaInfo) {
    return (
      <div className="hub-orcamento-novo">
        <p className="hub-clientes__muted">Comanda não encontrada.</p>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    aberta: 'Aberta',
    fechada: 'Fechada',
    cancelada: 'Cancelada',
  };

  return (
    <div className="hub-orcamento-novo">
      {/* ── Topbar / Header ── */}
      <header className="hub-orcamento-novo__topbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--hub-muted)' }}>
            <Link to="/hub/caixa" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'inherit', textDecoration: 'none' }}>
              <ArrowLeft size={14} />
              Caixa
            </Link>
            <span>/</span>
            <span>Comanda</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`hub-finance-badge hub-finance-badge--${comandaInfo.status}`}>
              {statusLabel[comandaInfo.status] ?? comandaInfo.status}
            </span>
            {comandaInfo.guardian_name && (
              <span style={{ fontSize: 14, color: 'var(--hub-text)' }}>
                Tutor: <strong>{comandaInfo.guardian_name}</strong>
              </span>
            )}
            {comandaInfo.pet_name && (
              <span style={{ fontSize: 14, color: 'var(--hub-text)' }}>
                Pet: <strong>{comandaInfo.pet_name}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          {isAberta && canWrite && (
            <>
              <button
                type="button"
                className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                Salvar
              </button>
              <button
                type="button"
                className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
                disabled={saving}
                onClick={() => setShowCheckout(true)}
              >
                <Coins size={16} style={{ marginRight: 4 }} />
                Cobrar
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Layout 2 colunas ── */}
      <div className="hub-orcamento-novo__grid">
        {/* ── Coluna principal: itens ── */}
        <div className="hub-orcamento-novo__main">
          <section className="hub-orcamento-novo__card">
            <div className="hub-orcamento-novo__card-header">
              <div>
                <h2 className="hub-orcamento-novo__card-title">Itens da comanda</h2>
                {!isAberta && (
                  <p className="hub-orcamento-novo__card-subtitle">Esta comanda não está aberta e não pode ser editada.</p>
                )}
              </div>
              {isAberta && canWrite && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="hub-orcamento-novo__services-search-wrap" style={{ minWidth: 180 }}>
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
            </div>

            {items.length === 0 ? (
              <p className="hub-orcamento-novo__help">Nenhum item na comanda.</p>
            ) : (
              <div className="hub-orcamento-novo__services-scroller">
                <table className="hub-orcamento-novo__services-table">
                  <thead>
                    <tr>
                      <th>Descrição / Serviço</th>
                      <th>Pet</th>
                      <th className="right">Qtd</th>
                      <th className="right">Valor unit.</th>
                      <th className="right">Desconto</th>
                      <th className="right">Total linha</th>
                      {isAberta && canWrite && <th aria-label="Ações" />}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const editable = isAberta && canWrite && !it.invoiced;
                      const isManual = it.origin_type === 'manual';
                      return (
                        <tr
                          key={it.id ?? `new-${idx}`}
                          className={it.invoiced ? 'hub-comanda-row--invoiced' : ''}
                        >
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
                          <td className="hub-orcamento-novo__services-table-cell--muted">
                            {it.pet_name ?? '—'}
                          </td>
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
                          {isAberta && canWrite && (
                            <td>
                              {it.invoiced ? (
                                <span
                                  className="hub-orcamento-novo__services-table-cell--muted"
                                  title="Item faturado"
                                  style={{ fontSize: 11 }}
                                >
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
          </section>
        </div>

        {/* ── Sidebar: resumo + ações ── */}
        <aside className="hub-orcamento-novo__sidebar">
          <FinancialSummaryCard
            subtotal={summary.subtotal}
            discountAmount={summary.discountAmount}
            total={summary.total}
            discountControl={
              isAberta && canWrite ? (
                <div className="hub-orcamento-novo__card" style={{ boxShadow: 'none', padding: 0 }}>
                  <h4 className="hub-orcamento-novo__footer-card-title" style={{ marginBottom: 6 }}>Desconto global</h4>
                  <DiscountControl
                    idPrefix="comanda"
                    kind={discountKind}
                    valueStr={discountValueStr}
                    onKindChange={setDiscountKind}
                    onValueStrChange={setDiscountValueStr}
                    disabled={saving}
                  />
                </div>
              ) : null
            }
          />

          {/* Notas internas */}
          <div className="hub-orcamento-novo__card">
            <h3 className="hub-orcamento-novo__card-title">Observação interna</h3>
            <div className="hub-orcamento-novo__field hub-orcamento-novo__field--wide">
              <textarea
                className="hub-orcamento-novo__textarea"
                rows={3}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Apenas a equipe vê"
                disabled={!isAberta || !canWrite}
              />
              <p className="hub-orcamento-novo__char-count">{notes.length}/2000</p>
            </div>
          </div>

          {/* Ações */}
          {isAberta && canWrite && (
            <div className="hub-orcamento-novo__card">
              <h3 className="hub-orcamento-novo__card-title">Ações</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={saving}
                  onClick={() => setShowCheckout(true)}
                >
                  <Coins size={16} />
                  Cobrar
                </button>
                <button
                  type="button"
                  className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={saving}
                  onClick={() => handleSendToFinancial()}
                >
                  <Send size={16} />
                  Enviar ao financeiro
                </button>
                <button
                  type="button"
                  className="hub-orcamento-novo__btn hub-orcamento-novo__btn--ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          {!isAberta && (
            <div className="hub-orcamento-novo__card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--hub-muted)' }}>
                <Ban size={16} />
                <span style={{ fontSize: 13 }}>Comanda encerrada — somente leitura.</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ── Drawer de cobrança ── */}
      {showCheckout && comandaId && clinicId && unitId && (
        <ComandaCheckoutDrawer
          open={showCheckout}
          onClose={() => setShowCheckout(false)}
          clinicId={clinicId}
          unitId={unitId}
          comandaId={comandaId}
          onSuccess={() => {
            setShowCheckout(false);
            navigate('/hub/caixa');
          }}
        />
      )}
    </div>
  );
}
