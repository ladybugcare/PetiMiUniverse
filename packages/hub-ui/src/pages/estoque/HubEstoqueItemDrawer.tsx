import React from 'react';
import { Package } from 'lucide-react';
import type { HubExpiryAlertPolicy, HubInventoryItem, HubItemKind } from '../../api/hubInventoryApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubDateField } from '../../components/HubDateField';
import { HubCancelButton } from '../../components/HubCancelButton';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../servicos/servicos-page.css';
import './estoque.css';

export const INVENTORY_FORM_ID = 'hub-estoque-item-form';

export type InventoryFormState = {
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

function kindLabel(k: HubItemKind): string {
  if (k === 'medication') return 'Medicamento';
  if (k === 'vaccine') return 'Vacina';
  return 'Produto';
}

export type HubEstoqueItemDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  itemKind: HubItemKind;
  form: InventoryFormState;
  setForm: React.Dispatch<React.SetStateAction<InventoryFormState>>;
  saving: boolean;
  canWrite: boolean;
  editingItem?: HubInventoryItem;
  manufacturerOptions: HubComboboxOption[];
  supplierOptions: HubComboboxOption[];
  productGroupOptions: HubComboboxOption[];
  onManufacturerChange: (v: string) => void;
  onSupplierChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
};

export const HubEstoqueItemDrawer: React.FC<HubEstoqueItemDrawerProps> = ({
  open,
  onClose,
  mode,
  itemKind,
  form,
  setForm,
  saving,
  canWrite,
  editingItem,
  manufacturerOptions,
  supplierOptions,
  productGroupOptions,
  onManufacturerChange,
  onSupplierChange,
  onSubmit,
}) => {
  const title = mode === 'create' ? `Novo ${kindLabel(itemKind).toLowerCase()}` : 'Editar item';
  const subtitle = mode === 'edit' && editingItem ? editingItem.name : undefined;

  return (
    <HubSidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={<Package size={20} strokeWidth={2} aria-hidden />}
      subtitle={subtitle}
      size="wide"
      contentKey={mode === 'edit' ? editingItem?.id ?? 'edit' : 'create'}
      footer={
        <div className="hub-finance-page__drawer-footer">
          <HubCancelButton onClick={onClose} disabled={saving} />
          <button
            type="submit"
            form={INVENTORY_FORM_ID}
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={saving || !canWrite}
          >
            {saving ? 'Salvando…' : mode === 'create' ? 'Criar item' : 'Salvar alterações'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes-drawer__content">
        <form id={INVENTORY_FORM_ID} onSubmit={onSubmit}>
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
              onChange={(v) => void onManufacturerChange(v)}
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
              onChange={(v) => void onSupplierChange(v)}
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
              onChange={(e) =>
                setForm((f) => ({ ...f, expiry_alert_policy: e.target.value as HubExpiryAlertPolicy }))
              }
            >
              <option value="none">Não avisar</option>
              <option value="d30">30 dias antes</option>
              <option value="d60">60 dias antes</option>
              <option value="d90">90 dias antes</option>
            </select>
          </div>

          {mode === 'create' && (
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
        </form>
      </div>
    </HubSidePanel>
  );
};

export default HubEstoqueItemDrawer;
