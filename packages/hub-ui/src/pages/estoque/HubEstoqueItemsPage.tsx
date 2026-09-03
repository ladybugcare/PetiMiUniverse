import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Archive, Package, Pencil, Plus, Search } from 'lucide-react';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubExpiryAlertPolicy,
  type HubInventoryItem,
  type HubItemKind,
  type HubManufacturer,
  type HubSupplier,
} from '../../api/hubInventoryApi';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import HubEstoqueItemDrawer, { type InventoryFormState } from './HubEstoqueItemDrawer';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './estoque.css';

function formatMoneyNumberBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatMoneyCurrencyBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function parseMoneyInput(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/R\$\s*/gi, '')
    .trim()
    .replace(/\s/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) s = s.replace(/,/g, '');
  else if (lastComma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function kindLabel(k: HubItemKind): string {
  if (k === 'medication') return 'Medicamento';
  if (k === 'vaccine') return 'Vacina';
  return 'Produto';
}

/** Distingue ID existente de texto livre ao usar allowCreate no combobox (valor = id ou nome novo). */
function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

type PanelMode = 'none' | 'create' | 'edit';

const emptyForm = (): InventoryFormState => ({
  name: '',
  ean: '',
  unit_label: '',
  manufacturer_id: '',
  allow_fractional: false,
  store_sku: '',
  sale_purpose: 'SALE',
  product_group: '',
  default_supplier_id: '',
  description: '',
  cost_amount: '',
  sale_amount: '',
  supplier_discount_pct: '0',
  max_sale_discount_pct: '100',
  allow_price_override_on_sale: false,
  generates_staff_commission: false,
  min_stock_qty: '0',
  expiry_alert_policy: 'none',
  initial_received_at: new Date().toISOString().slice(0, 10),
  initial_expiry_date: '',
  initial_qty: '',
  initial_lot_code: '',
});

const fromRow = (t: HubInventoryItem): InventoryFormState => ({
  name: t.name,
  ean: t.ean ?? '',
  unit_label: t.unit_label ?? '',
  manufacturer_id: t.manufacturer_id ?? '',
  allow_fractional: Boolean(t.allow_fractional),
  store_sku: t.store_sku ?? '',
  sale_purpose: t.sale_purpose ?? 'SALE',
  product_group: t.product_group ?? '',
  default_supplier_id: t.default_supplier_id ?? '',
  description: t.description ?? '',
  cost_amount: formatMoneyNumberBrl(Number(t.cost_amount)),
  sale_amount: formatMoneyNumberBrl(Number(t.sale_amount)),
  supplier_discount_pct: String(t.supplier_discount_pct ?? 0),
  max_sale_discount_pct: String(t.max_sale_discount_pct ?? 100),
  allow_price_override_on_sale: Boolean(t.allow_price_override_on_sale),
  generates_staff_commission: Boolean(t.generates_staff_commission),
  min_stock_qty: String(t.min_stock_qty ?? 0),
  expiry_alert_policy: (t.expiry_alert_policy as HubExpiryAlertPolicy) || 'none',
  initial_received_at: new Date().toISOString().slice(0, 10),
  initial_expiry_date: '',
  initial_qty: '',
  initial_lot_code: '',
});

export interface HubEstoqueItemsPageProps {
  itemKind: HubItemKind;
}

const HubEstoqueItemsPage: React.FC<HubEstoqueItemsPageProps> = ({ itemKind }) => {
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.inventory.write');
  const accessAllowed = hasPermission('hub.inventory.read');

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [manufacturers, setManufacturers] = useState<HubManufacturer[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InventoryFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const searchRef = useRef(search);
  searchRef.current = search;

  const loadItems = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const s = searchRef.current.trim();
      const res = await hubInventoryApi.items.list(clinicId, true, itemKind, s || undefined);
      setItems(res.items || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar itens');
    } finally {
      setLoading(false);
    }
  }, [clinicId, itemKind, showError]);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const runSearch = useCallback(() => {
    const value = searchRef.current.trim();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set('q', value);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
    void loadItems();
  }, [loadItems, setSearchParams]);

  const loadRefs = useCallback(async () => {
    if (!clinicId) return;
    try {
      const [s, m] = await Promise.all([
        hubInventoryApi.suppliers.list(clinicId),
        hubInventoryApi.manufacturers.list(clinicId),
      ]);
      setSuppliers(s.suppliers || []);
      setManufacturers(m.manufacturers || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar fornecedores / fabricantes');
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadRefs();
  }, [clinicId, accessAllowed, loadRefs]);

  // Deep link /hub/estoque?q=… (ex.: relatórios) e reload ao mudar o parâmetro.
  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    const q = searchParams.get('q') ?? '';
    setSearch(q);
    searchRef.current = q;
    void loadItems();
  }, [clinicId, accessAllowed, loadItems, searchParams]);

  const metrics = useMemo(() => {
    const total = items.length;
    const low = items.filter((i) => (i.qty_on_hand ?? 0) < Number(i.min_stock_qty || 0) && Number(i.min_stock_qty || 0) > 0).length;
    return { total, low };
  }, [items]);

  const manufacturerOptions = useMemo((): HubComboboxOption[] => {
    const sorted = [...manufacturers].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    const rows: HubComboboxOption[] = sorted.map((m) => ({ value: m.id, label: m.name }));
    const id = form.manufacturer_id.trim();
    if (id && !rows.some((o) => o.value === id)) {
      rows.push({ value: id, label: `${manufacturers.find((m) => m.id === id)?.name ?? 'Fabricante'} (referência)` });
    }
    return [{ value: '', label: '—' }, ...rows];
  }, [manufacturers, form.manufacturer_id]);

  const supplierOptions = useMemo((): HubComboboxOption[] => {
    const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    const rows: HubComboboxOption[] = sorted.map((s) => ({ value: s.id, label: s.name }));
    const id = form.default_supplier_id.trim();
    if (id && !rows.some((o) => o.value === id)) {
      rows.push({ value: id, label: `${suppliers.find((s) => s.id === id)?.name ?? 'Fornecedor'} (referência)` });
    }
    return [{ value: '', label: '—' }, ...rows];
  }, [suppliers, form.default_supplier_id]);

  /** Grupos já usados nos itens desta vista + valor atual; novos via allowCreate (texto livre, sem tabela). */
  const productGroupOptions = useMemo((): HubComboboxOption[] => {
    const seen = new Set<string>();
    for (const it of items) {
      const g = (it.product_group ?? '').trim();
      if (g) seen.add(g);
    }
    const sorted = [...seen].sort((a, b) => a.localeCompare(b, 'pt'));
    const rows: HubComboboxOption[] = sorted.map((g) => ({ value: g, label: g }));
    const current = form.product_group.trim();
    if (current && !rows.some((o) => o.value === current)) {
      rows.push({ value: form.product_group, label: `${current} (valor atual)` });
    }
    return [{ value: '', label: '—' }, ...rows];
  }, [items, form.product_group]);

  const handleManufacturerComboboxChange = useCallback(
    async (v: string) => {
      const t = v.trim();
      if (!t) {
        setForm((f) => ({ ...f, manufacturer_id: '' }));
        return;
      }
      if (manufacturers.some((m) => m.id === t)) {
        setForm((f) => ({ ...f, manufacturer_id: t }));
        return;
      }
      if (isLikelyUuid(t)) {
        setForm((f) => ({ ...f, manufacturer_id: t }));
        return;
      }
      if (!clinicId || !canWrite) {
        showError('Sem permissão para criar fabricante.');
        return;
      }
      try {
        const res = await hubInventoryApi.manufacturers.create({ clinic_id: clinicId, name: t });
        const created = res.manufacturer;
        setManufacturers((prev) =>
          [...prev.filter((m) => m.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, 'pt')),
        );
        setForm((f) => ({ ...f, manufacturer_id: created.id }));
        showSuccess('Fabricante adicionado');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao criar fabricante');
      }
    },
    [clinicId, canWrite, manufacturers, showError, showSuccess],
  );

  const handleSupplierComboboxChange = useCallback(
    async (v: string) => {
      const t = v.trim();
      if (!t) {
        setForm((f) => ({ ...f, default_supplier_id: '' }));
        return;
      }
      if (suppliers.some((s) => s.id === t)) {
        setForm((f) => ({ ...f, default_supplier_id: t }));
        return;
      }
      if (isLikelyUuid(t)) {
        setForm((f) => ({ ...f, default_supplier_id: t }));
        return;
      }
      if (!clinicId || !canWrite) {
        showError('Sem permissão para criar fornecedor.');
        return;
      }
      try {
        const res = await hubInventoryApi.suppliers.create({ clinic_id: clinicId, name: t });
        const created = res.supplier;
        setSuppliers((prev) =>
          [...prev.filter((s) => s.id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name, 'pt')),
        );
        setForm((f) => ({ ...f, default_supplier_id: created.id }));
        showSuccess('Fornecedor adicionado');
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao criar fornecedor');
      }
    },
    [clinicId, canWrite, suppliers, showError, showSuccess],
  );

  const openCreate = () => {
    setPanelMode('create');
    setEditingId(null);
    setForm(emptyForm());
  };

  const openEdit = (t: HubInventoryItem) => {
    if (!canWrite) return;
    setPanelMode('edit');
    setEditingId(t.id);
    setForm(fromRow(t));
  };

  const closePanel = () => {
    setPanelMode('none');
    setEditingId(null);
    setForm(emptyForm());
  };

  const parsePct = (s: string): number => {
    const n = Number(String(s).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(100, Math.max(0, n));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    const name = form.name.trim();
    if (!name) {
      showError('Nome do produto é obrigatório.');
      return;
    }
    const cost = parseMoneyInput(form.cost_amount);
    const sale = parseMoneyInput(form.sale_amount);
    if (cost == null || cost < 0.01) {
      showError('Valor de custo mínimo: R$ 0,01');
      return;
    }
    if (sale == null || sale < 0.01) {
      showError('Valor de venda mínimo: R$ 0,01');
      return;
    }
    const minStock = Number(String(form.min_stock_qty).replace(',', '.'));
    if (!Number.isFinite(minStock) || minStock < 0) {
      showError('Estoque mínimo inválido.');
      return;
    }

    let initial_lot: {
      received_at: string;
      expiry_date?: string | null;
      qty: number;
      lot_code?: string | null;
    } | null = null;
    if (panelMode === 'create') {
      const qStr = form.initial_qty.trim();
      if (qStr) {
        const q = Number(String(qStr).replace(',', '.'));
        if (!Number.isFinite(q) || q <= 0) {
          showError('Quantidade do lote inicial deve ser maior que zero.');
          return;
        }
        if (!form.initial_received_at) {
          showError('Data de entrada do lote inicial é obrigatória quando há quantidade.');
          return;
        }
        initial_lot = {
          received_at: form.initial_received_at,
          expiry_date: form.initial_expiry_date.trim() || null,
          qty: q,
          lot_code: form.initial_lot_code.trim() || null,
        };
      }
    }

    setSaving(true);
    try {
      if (panelMode === 'create') {
        await hubInventoryApi.items.create({
          clinic_id: clinicId,
          item_kind: itemKind,
          ean: form.ean.trim() || null,
          name,
          unit_label: form.unit_label.trim() || null,
          manufacturer_id: form.manufacturer_id || null,
          allow_fractional: form.allow_fractional,
          store_sku: form.store_sku.trim() || null,
          sale_purpose: form.sale_purpose.trim() || null,
          product_group: form.product_group.trim() || null,
          default_supplier_id: form.default_supplier_id || null,
          description: form.description.trim() || null,
          cost_amount: cost,
          sale_amount: sale,
          supplier_discount_pct: parsePct(form.supplier_discount_pct),
          max_sale_discount_pct: parsePct(form.max_sale_discount_pct),
          allow_price_override_on_sale: form.allow_price_override_on_sale,
          generates_staff_commission: form.generates_staff_commission,
          min_stock_qty: minStock,
          expiry_alert_policy: form.expiry_alert_policy,
          initial_lot,
        });
        showSuccess('Produto criado');
      } else if (panelMode === 'edit' && editingId) {
        await hubInventoryApi.items.patch(editingId, {
          clinic_id: clinicId,
          ean: form.ean.trim() || null,
          name,
          unit_label: form.unit_label.trim() || null,
          manufacturer_id: form.manufacturer_id || null,
          allow_fractional: form.allow_fractional,
          store_sku: form.store_sku.trim() || null,
          sale_purpose: form.sale_purpose.trim() || null,
          product_group: form.product_group.trim() || null,
          default_supplier_id: form.default_supplier_id || null,
          description: form.description.trim() || null,
          cost_amount: cost,
          sale_amount: sale,
          supplier_discount_pct: parsePct(form.supplier_discount_pct),
          max_sale_discount_pct: parsePct(form.max_sale_discount_pct),
          allow_price_override_on_sale: form.allow_price_override_on_sale,
          generates_staff_commission: form.generates_staff_commission,
          min_stock_qty: minStock,
          expiry_alert_policy: form.expiry_alert_policy,
        });
        showSuccess('Produto atualizado');
      }
      await loadItems();
      await loadRefs();
      closePanel();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const archiveItem = (t: HubInventoryItem) => {
    if (!clinicId || !canWrite) return;
    showConfirm(`Arquivar "${t.name}"?`, async () => {
      try {
        await hubInventoryApi.items.patch(t.id, { clinic_id: clinicId, archived: true });
        showSuccess('Arquivado');
        await loadItems();
        if (editingId === t.id) closePanel();
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro');
      }
    }, 'Arquivar');
  };

  if (!user) return <Navigate to="/login" replace />;
  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">selecione uma clínica.</p>
      </div>
    );
  }
  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-estoque-page" style={{ padding: 24 }}>
        <HubLoading variant="block" />
      </div>
    );
  }

  const editingItem = editingId ? items.find((i) => i.id === editingId) : undefined;
  const drawerOpen = panelMode !== 'none' && canWrite;

  return (
    <>
      <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page hub-clientes-page--full-width">
        <div className="hub-clientes__main">
          <div className="hub-servicos-config__header">
            <div>
              <h1 className="hub-servicos-config__title">{kindLabel(itemKind)}</h1>
              <p className="hub-clientes__muted hub-servicos-config__lead">
                Cadastro e gestão de {kindLabel(itemKind).toLowerCase()}s no inventário da clínica.
              </p>
            </div>
          </div>

          <div className="hub-servicos__metrics" aria-live="polite">
            <div className="hub-servicos__metric-card">
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Total de itens</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : metrics.total.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">{kindLabel(itemKind)}s cadastrados</div>
              </div>
              <div className="hub-servicos__metric-icon" aria-hidden>
                <Package size={22} strokeWidth={1.75} />
              </div>
            </div>
            <div className="hub-servicos__metric-card">
              <div className="hub-servicos__metric-card__text">
                <div className="hub-servicos__metric-label">Abaixo do mínimo</div>
                <div className="hub-servicos__metric-value">
                  {loading ? '—' : metrics.low.toLocaleString('pt-BR')}
                </div>
                <div className="hub-servicos__metric-sub">Itens com estoque crítico</div>
              </div>
              <div
                className={`hub-servicos__metric-icon${metrics.low > 0 ? '' : ' hub-servicos__metric-icon--muted'}`}
                aria-hidden
              >
                <AlertTriangle size={22} strokeWidth={1.75} />
              </div>
            </div>
          </div>

          <div className="hub-servicos__toolbar">
            <div className="hub-servicos__toolbar-row">
              <div className="hub-servicos__search-wrap">
                <div className="hub-servicos__search-field">
                  <span className="hub-servicos__search-icon">
                    <Search size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <input
                    type="search"
                    className="hub-servicos__search-input"
                    placeholder="Buscar por nome, EAN ou SKU…"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runSearch();
                    }}
                    aria-label="Buscar itens"
                  />
                </div>
              </div>
              {canWrite && (
                <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                  Novo {kindLabel(itemKind).toLowerCase()}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <HubLoading variant="block" label="Carregando itens…" />
          ) : items.length === 0 ? (
            <div className="hub-packages__empty">
              <div className="hub-packages__empty-icon" aria-hidden>
                <Package size={36} strokeWidth={1.5} />
              </div>
              <h2 className="hub-packages__empty-title">Nenhum {kindLabel(itemKind).toLowerCase()} cadastrado</h2>
              <p className="hub-packages__empty-text">
                Cadastre {kindLabel(itemKind).toLowerCase()}s para controlar quantidade, preços e alertas de estoque.
              </p>
              {canWrite && (
                <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                  Criar primeiro {kindLabel(itemKind).toLowerCase()}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hub-servicos__table-wrap hub-clientes__table-wrap--desktop">
                <table className="hub-clientes__table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>EAN</th>
                      <th>SKU</th>
                      <th>Qtd</th>
                      <th>Mín.</th>
                      <th className="hub-servicos__td-money">Custo</th>
                      <th className="hub-servicos__td-money">Venda</th>
                      {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => {
                      const isLow =
                        Number(t.min_stock_qty || 0) > 0 && (t.qty_on_hand ?? 0) < Number(t.min_stock_qty || 0);
                      return (
                        <tr
                          key={t.id}
                          className="hub-packages__row"
                          onClick={() => {
                            if (canWrite) openEdit(t);
                          }}
                          style={{ cursor: canWrite ? 'pointer' : 'default' }}
                        >
                          <td>
                            <div className="hub-servicos__svc-cell">
                              <div className="hub-servicos__svc-icon-ring hub-packages__icon-ring" aria-hidden>
                                <Package size={22} strokeWidth={1.75} color="var(--hc-brand)" />
                              </div>
                              <div className="hub-servicos__metric-card__text">
                                <div className="hub-servicos__svc-title">{t.name}</div>
                                {t.product_group ? (
                                  <div className="hub-servicos__svc-desc">{t.product_group}</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="hub-clientes__muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {t.ean || '—'}
                          </td>
                          <td className="hub-clientes__muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {t.store_sku || '—'}
                          </td>
                          <td>
                            <span
                              className={`hub-clientes__pill ${
                                isLow ? 'hub-clientes__pill--inactive' : 'hub-clientes__pill--active'
                              }`}
                            >
                              {t.qty_on_hand ?? 0}
                            </span>
                          </td>
                          <td>{t.min_stock_qty}</td>
                          <td className="hub-servicos__td-money">{formatMoneyCurrencyBrl(Number(t.cost_amount))}</td>
                          <td className="hub-servicos__td-money">{formatMoneyCurrencyBrl(Number(t.sale_amount))}</td>
                          {canWrite ? (
                            <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                              <div className="hub-servicos__row-actions">
                                <button
                                  type="button"
                                  className="hub-servicos__icon-btn"
                                  title="Editar"
                                  aria-label="Editar item"
                                  onClick={() => openEdit(t)}
                                >
                                  <Pencil size={18} strokeWidth={2} />
                                </button>
                                <button
                                  type="button"
                                  className="hub-servicos__icon-btn"
                                  title="Arquivar"
                                  aria-label="Arquivar item"
                                  onClick={() => archiveItem(t)}
                                >
                                  <Archive size={18} strokeWidth={2} />
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="hub-clientes__mobile-list" aria-label="Lista de itens">
                {items.map((t) => {
                  const isLow =
                    Number(t.min_stock_qty || 0) > 0 && (t.qty_on_hand ?? 0) < Number(t.min_stock_qty || 0);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="hub-clientes__mobile-card"
                      onClick={() => {
                        if (canWrite) openEdit(t);
                      }}
                      disabled={!canWrite}
                    >
                      <div className="hub-clientes__mobile-card-top">
                        <div className="hub-clientes__mobile-card-main">
                          <span className="hub-clientes__mobile-card-name">{t.name}</span>
                          <span className="hub-clientes__muted hub-clientes__mobile-card-contact">
                            {t.ean ? `EAN ${t.ean}` : 'Sem EAN'}
                            {t.store_sku ? ` · SKU ${t.store_sku}` : ''}
                          </span>
                        </div>
                        <span
                          className={`hub-clientes__pill ${
                            isLow ? 'hub-clientes__pill--inactive' : 'hub-clientes__pill--active'
                          }`}
                        >
                          {t.qty_on_hand ?? 0} un.
                        </span>
                      </div>
                      <div className="hub-clientes__mobile-card-foot">
                        <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          Mín. {t.min_stock_qty}
                        </span>
                        <span className="hub-clientes__muted hub-clientes__mobile-card-pets">
                          {formatMoneyCurrencyBrl(Number(t.sale_amount))}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <HubEstoqueItemDrawer
        open={drawerOpen}
        onClose={closePanel}
        mode={panelMode === 'edit' ? 'edit' : 'create'}
        itemKind={itemKind}
        form={form}
        setForm={setForm}
        saving={saving}
        canWrite={canWrite}
        editingItem={editingItem}
        manufacturerOptions={manufacturerOptions}
        supplierOptions={supplierOptions}
        productGroupOptions={productGroupOptions}
        onManufacturerChange={handleManufacturerComboboxChange}
        onSupplierChange={handleSupplierComboboxChange}
        onSubmit={handleSave}
      />
    </>
  );
};

export default HubEstoqueItemsPage;
