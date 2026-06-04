import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredClinicId, useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import {
  hubInventoryApi,
  type HubExpiryAlertPolicy,
  type HubInventoryItem,
  type HubItemKind,
  type HubManufacturer,
  type HubSupplier,
} from '../../api/hubInventoryApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { useAlert } from '../../components/AlertProvider';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubDateField } from '../../components/HubDateField';
import { HubCancelButton } from '../../components/HubCancelButton';
import { redirectAwayFromHub } from '../../utils/redirectAwayFromHub';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import '../servicos/servicos-page.css';
import './estoque.css';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT', 'CVET_INTERNAL'] as const;

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

type FormState = {
  name: string;
  ean: string;
  unit_label: string;
  manufacturer_id: string;
  allow_fractional: boolean;
  store_sku: string;
  sale_purpose: string;
  product_group: string;
  default_supplier_id: string;
  description: string;
  cost_amount: string;
  sale_amount: string;
  supplier_discount_pct: string;
  max_sale_discount_pct: string;
  allow_price_override_on_sale: boolean;
  generates_staff_commission: boolean;
  min_stock_qty: string;
  expiry_alert_policy: HubExpiryAlertPolicy;
  initial_received_at: string;
  initial_expiry_date: string;
  initial_qty: string;
  initial_lot_code: string;
};

const emptyForm = (): FormState => ({
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

const fromRow = (t: HubInventoryItem): FormState => ({
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
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.inventory.write');
  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HubInventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<HubSupplier[]>([]);
  const [manufacturers, setManufacturers] = useState<HubManufacturer[]>([]);
  const [search, setSearch] = useState('');
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
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

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadItems();
  }, [clinicId, accessAllowed, loadItems]);

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
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-servicos-page hub-estoque-page hub-pets-page">
      <div className="hub-clientes__main">
        <div className="hub-servicos__metrics" aria-live="polite">
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Itens ({kindLabel(itemKind)})</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.total}</div>
            </div>
          </div>
          <div className="hub-servicos__metric-card">
            <div className="hub-servicos__metric-card__text">
              <div className="hub-servicos__metric-label">Abaixo do mínimo</div>
              <div className="hub-servicos__metric-value">{loading ? '—' : metrics.low}</div>
            </div>
          </div>
        </div>

        <div className="hub-servicos__toolbar">
          <div className="hub-servicos__toolbar-row">
            <div className="hub-servicos__search-wrap">
              <input
                type="search"
                className="hub-servicos__search-input"
                placeholder="Buscar por nome, EAN ou SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void loadItems();
                }}
                aria-label="Buscar"
              />
            </div>
            {canWrite && (
              <button type="button" className="hub-servicos__btn-primary-icon" onClick={openCreate}>
                + Novo {kindLabel(itemKind).toLowerCase()}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="hub-clientes__muted">Carregando…</p>
        ) : (
          <div className="hub-servicos__table-wrap">
            <table className="hub-clientes__table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>EAN</th>
                  <th>SKU</th>
                  <th>Qtd</th>
                  <th>Mín.</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  {canWrite ? <th className="hub-clientes__th-actions">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 8 : 7} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                      Nenhum item.
                    </td>
                  </tr>
                ) : (
                  items.map((t) => (
                    <tr
                      key={t.id}
                      className={canWrite ? undefined : undefined}
                      onClick={() => {
                        if (canWrite) openEdit(t);
                      }}
                      style={{ cursor: canWrite ? 'pointer' : 'default' }}
                    >
                      <td>
                        <strong>{t.name}</strong>
                      </td>
                      <td className="hub-clientes__muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {t.ean || '—'}
                      </td>
                      <td className="hub-clientes__muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {t.store_sku || '—'}
                      </td>
                      <td>{t.qty_on_hand ?? 0}</td>
                      <td>{t.min_stock_qty}</td>
                      <td>{formatMoneyCurrencyBrl(Number(t.cost_amount))}</td>
                      <td>{formatMoneyCurrencyBrl(Number(t.sale_amount))}</td>
                      {canWrite ? (
                        <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="hub-clientes__link-btn" onClick={() => openEdit(t)}>
                            Editar
                          </button>
                          <button type="button" className="hub-clientes__link-btn" onClick={() => archiveItem(t)}>
                            Arquivar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="hub-estoque__encounter-note">
          <strong>Integração com atendimentos:</strong> quando existir API de consultas/banho no Hub, as saídas{' '}
          <code>encounter_out</code> poderão ser criadas automaticamente ao consumir material no atendimento (
          <code>reference_type</code> / <code>reference_id</code>).
        </p>
      </div>

      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {panelMode === 'none' ? (
            <p className="hub-clientes__muted" style={{ margin: 0 }}>
              {canWrite ? 'Clique numa linha para editar ou crie um novo item.' : 'Sem permissão de escrita no inventário.'}
            </p>
          ) : !canWrite ? (
            <p className="hub-clientes__muted">Sem permissão de escrita.</p>
          ) : (
            <form onSubmit={handleSave}>
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  {panelMode === 'create' ? `Novo ${kindLabel(itemKind).toLowerCase()}` : 'Editar item'}
                </h2>
                <button type="button" className="hub-clientes__panel-close" aria-label="Fechar" onClick={closePanel}>
                  ×
                </button>
              </div>

              <h3 className="hub-servicos__form-section-title">Informações gerais</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-ean">
                  EAN / código de barras (opcional)
                </label>
                <input
                  id="inv-ean"
                  className="hub-clientes__input"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.ean}
                  onChange={(e) => setForm((f) => ({ ...f, ean: e.target.value }))}
                  placeholder="8 ou 13 dígitos"
                />
                <p className="hub-estoque__hint-ean">Leitor USB em modo teclado: coloque o foco aqui e escaneie.</p>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-name">
                  Nome do produto *
                </label>
                <input
                  id="inv-name"
                  className="hub-clientes__input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-unit">
                  Unidade de medida
                </label>
                <input
                  id="inv-unit"
                  className="hub-clientes__input"
                  value={form.unit_label}
                  onChange={(e) => setForm((f) => ({ ...f, unit_label: e.target.value }))}
                  placeholder="Ex.: Unidade, Caixa, Litro"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-manufacturer">
                  Fabricante
                </label>
                <HubSearchableCombobox
                  id="inv-manufacturer"
                  className="hub-combobox--clientes"
                  options={manufacturerOptions}
                  value={form.manufacturer_id}
                  onChange={(v) => void handleManufacturerComboboxChange(v)}
                  placeholder="Selecionar ou buscar fabricante"
                  searchPlaceholder="Buscar fabricante…"
                  allowCreate={canWrite}
                  createEntityLabel="fabricante"
                  emptyResultsLabel="Nenhum fabricante encontrado"
                  ariaLabel="Fabricante"
                />
              </div>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.allow_fractional}
                  onChange={(allow_fractional) => setForm((f) => ({ ...f, allow_fractional }))}
                >
                  Permite quantidades fracionadas
                </HubCheckbox>
              </div>

              <h3 className="hub-servicos__form-section-title">Identificação e categorização</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-sku">
                  SKU da loja (opcional)
                </label>
                <input
                  id="inv-sku"
                  className="hub-clientes__input"
                  value={form.store_sku}
                  onChange={(e) => setForm((f) => ({ ...f, store_sku: e.target.value }))}
                  placeholder="Ex.: PROD-001"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-purpose">
                  Finalidade
                </label>
                <input
                  id="inv-purpose"
                  className="hub-clientes__input"
                  value={form.sale_purpose}
                  onChange={(e) => setForm((f) => ({ ...f, sale_purpose: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-group">
                  Grupo de produto
                </label>
                <HubSearchableCombobox
                  id="inv-group"
                  className="hub-combobox--clientes"
                  options={productGroupOptions}
                  value={form.product_group}
                  onChange={(v) => setForm((f) => ({ ...f, product_group: v }))}
                  placeholder="Selecionar ou criar grupo"
                  searchPlaceholder="Buscar ou escrever grupo…"
                  allowCreate={canWrite}
                  createEntityLabel="grupo de produto"
                  emptyResultsLabel="Nenhum grupo encontrado"
                  ariaLabel="Grupo de produto"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-supplier">
                  Fornecedor
                </label>
                <HubSearchableCombobox
                  id="inv-supplier"
                  className="hub-combobox--clientes"
                  options={supplierOptions}
                  value={form.default_supplier_id}
                  onChange={(v) => void handleSupplierComboboxChange(v)}
                  placeholder="Selecionar ou buscar fornecedor"
                  searchPlaceholder="Buscar fornecedor…"
                  allowCreate={canWrite}
                  createEntityLabel="fornecedor"
                  emptyResultsLabel="Nenhum fornecedor encontrado"
                  ariaLabel="Fornecedor"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-desc">
                  Descrição
                </label>
                <textarea
                  id="inv-desc"
                  className="hub-clientes__textarea"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <h3 className="hub-servicos__form-section-title">Preços (R$)</h3>
              <div className="hub-servicos__price-grid">
                <div>
                  <label className="hub-clientes__label">Valor de custo *</label>
                  <div className="hub-servicos__money-field">
                    <span className="hub-servicos__money-prefix">R$</span>
                    <input
                      className="hub-clientes__input"
                      required
                      value={form.cost_amount}
                      onChange={(e) => setForm((f) => ({ ...f, cost_amount: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="hub-clientes__label">Valor de venda *</label>
                  <div className="hub-servicos__money-field">
                    <span className="hub-servicos__money-prefix">R$</span>
                    <input
                      className="hub-clientes__input"
                      required
                      value={form.sale_amount}
                      onChange={(e) => setForm((f) => ({ ...f, sale_amount: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="hub-servicos__price-grid">
                <div>
                  <label className="hub-clientes__label">Desconto fornecedor (%)</label>
                  <input
                    className="hub-clientes__input"
                    value={form.supplier_discount_pct}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_discount_pct: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="hub-clientes__label">Desconto máximo venda (%)</label>
                  <input
                    className="hub-clientes__input"
                    value={form.max_sale_discount_pct}
                    onChange={(e) => setForm((f) => ({ ...f, max_sale_discount_pct: e.target.value }))}
                  />
                </div>
              </div>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.allow_price_override_on_sale}
                  onChange={(allow_price_override_on_sale) =>
                    setForm((f) => ({ ...f, allow_price_override_on_sale }))
                  }
                >
                  Permite alterar o preço durante a venda
                </HubCheckbox>
              </div>
              <div className="hub-clientes__field">
                <HubCheckbox
                  checked={form.generates_staff_commission}
                  onChange={(generates_staff_commission) =>
                    setForm((f) => ({ ...f, generates_staff_commission }))
                  }
                >
                  Gera comissão para funcionários
                </HubCheckbox>
              </div>

              <h3 className="hub-servicos__form-section-title">Estoque</h3>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-min">
                  Estoque mínimo
                </label>
                <input
                  id="inv-min"
                  className="hub-clientes__input"
                  value={form.min_stock_qty}
                  onChange={(e) => setForm((f) => ({ ...f, min_stock_qty: e.target.value }))}
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-alert">
                  Alerta de vencimento
                </label>
                <select
                  id="inv-alert"
                  className="hub-clientes__select-input"
                  value={form.expiry_alert_policy}
                  onChange={(e) => setForm((f) => ({ ...f, expiry_alert_policy: e.target.value as HubExpiryAlertPolicy }))}
                >
                  <option value="none">Não avisar</option>
                  <option value="d30">30 dias antes</option>
                  <option value="d60">60 dias antes</option>
                  <option value="d90">90 dias antes</option>
                </select>
              </div>

              {panelMode === 'create' && (
                <>
                  <h3 className="hub-servicos__form-section-title">Lote inicial (opcional)</h3>
                  <div className="hub-clientes__field">
                    <HubDateField
                      id="inv-recv"
                      label="Data de entrada *"
                      valueIso={form.initial_received_at}
                      onChangeIso={(iso) =>
                        setForm((f) => ({ ...f, initial_received_at: iso || new Date().toISOString().slice(0, 10) }))
                      }
                      required
                    />
                  </div>
                  <div className="hub-clientes__field">
                    <HubDateField
                      id="inv-exp"
                      label="Data de validade"
                      valueIso={form.initial_expiry_date}
                      onChangeIso={(iso) => setForm((f) => ({ ...f, initial_expiry_date: iso }))}
                    />
                  </div>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="inv-iqty">
                      Quantidade (se preenchida, &gt; 0)
                    </label>
                    <input
                      id="inv-iqty"
                      className="hub-clientes__input"
                      value={form.initial_qty}
                      onChange={(e) => setForm((f) => ({ ...f, initial_qty: e.target.value }))}
                    />
                  </div>
                  <div className="hub-clientes__field">
                    <label className="hub-clientes__label" htmlFor="inv-lot">
                      Número do lote
                    </label>
                    <input
                      id="inv-lot"
                      className="hub-clientes__input"
                      value={form.initial_lot_code}
                      onChange={(e) => setForm((f) => ({ ...f, initial_lot_code: e.target.value }))}
                    />
                  </div>
                </>
              )}

              <div className="hub-clientes__footer-btns" style={{ borderTop: '1px solid var(--hc-border)', paddingTop: 16, marginTop: 12 }}>
                <div className="hub-clientes__btn-row">
                  <button type="submit" className="hub-clientes__btn hub-clientes__btn--primary" disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar'}
                  </button>
                  <HubCancelButton onClick={closePanel} />
                </div>
              </div>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
};

export default HubEstoqueItemsPage;
