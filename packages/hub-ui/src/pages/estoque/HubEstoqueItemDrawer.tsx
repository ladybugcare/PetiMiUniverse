import React, { useMemo } from 'react';
import { Package } from 'lucide-react';
import type { HubExpiryAlertPolicy, HubInventoryItem, HubItemKind } from '../../api/hubInventoryApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import { HubDateField } from '../../components/HubDateField';
import { HubCancelButton } from '../../components/HubCancelButton';
import HubEstoqueFilterChips from './HubEstoqueFilterChips';
import { kindLabel, kindNewLabel } from './estoqueShared';
import {
  stockUnitRequiresContent,
  stockUnitShowsContentFields,
} from './inventoryContentUtils';
import '../clientes/clientes.css';
import '../clientes/clientes-drawer.css';
import '../servicos/servicos-page.css';
import './estoque.css';

export const INVENTORY_FORM_ID = 'hub-estoque-item-form';

export type InventoryFormState = {
  item_kind: HubItemKind;
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
  content_qty: string;
  content_unit: string;
  initial_received_at: string;
  initial_expiry_date: string;
  initial_qty: string;
  initial_lot_code: string;
};

const KIND_OPTIONS: { id: HubItemKind; label: string }[] = [
  { id: 'product', label: 'Produto' },
  { id: 'medication', label: 'Medicamento' },
  { id: 'vaccine', label: 'Vacina' },
];

const UNIT_BASE: HubComboboxOption[] = [
  { value: 'Unidade', label: 'Unidade' },
  { value: 'Caixa', label: 'Caixa' },
  { value: 'Frasco', label: 'Frasco' },
  { value: 'Ampola', label: 'Ampola' },
  { value: 'Dose', label: 'Dose' },
  { value: 'ml', label: 'ml' },
  { value: 'Litro', label: 'Litro' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
];

const PURPOSE_BASE: HubComboboxOption[] = [
  { value: 'SALE', label: 'Venda' },
  { value: 'INTERNAL', label: 'Uso interno' },
  { value: 'CLINICAL', label: 'Uso clínico' },
];

const ALERT_OPTIONS: HubComboboxOption[] = [
  { value: 'none', label: 'Não avisar' },
  { value: 'd30', label: '30 dias antes' },
  { value: 'd60', label: '60 dias antes' },
  { value: 'd90', label: '90 dias antes' },
];

const CONTENT_UNIT_BASE: HubComboboxOption[] = [
  { value: 'ml', label: 'ml' },
  { value: 'Litro', label: 'Litro' },
  { value: 'g', label: 'g' },
  { value: 'Unidade', label: 'Unidade' },
  { value: 'Dose', label: 'Dose' },
];

function withCurrentOption(options: HubComboboxOption[], current: string): HubComboboxOption[] {
  const value = current.trim();
  if (!value || options.some((o) => o.value === value)) return options;
  return [...options, { value, label: value }];
}

export type HubEstoqueItemDrawerProps = {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  itemKind: HubItemKind;
  allowKindChange?: boolean;
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
  /** Abre o drawer de entrada/ajuste para o item em edição. */
  onRegisterMovement?: () => void;
};

export const HubEstoqueItemDrawer: React.FC<HubEstoqueItemDrawerProps> = ({
  open,
  onClose,
  mode,
  itemKind,
  allowKindChange = false,
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
  onRegisterMovement,
}) => {
  const activeKind = form.item_kind || itemKind;
  const title = mode === 'create' ? kindNewLabel(activeKind) : 'Editar item';
  const subtitle = mode === 'edit' && editingItem ? editingItem.name : undefined;

  const unitOptions = useMemo(() => withCurrentOption(UNIT_BASE, form.unit_label), [form.unit_label]);
  const purposeOptions = useMemo(
    () => withCurrentOption(PURPOSE_BASE, form.sale_purpose),
    [form.sale_purpose],
  );
  const contentUnitOptions = useMemo(
    () => withCurrentOption(CONTENT_UNIT_BASE, form.content_unit),
    [form.content_unit],
  );
  const showContentFields = stockUnitShowsContentFields(form.unit_label);
  const contentRequired = stockUnitRequiresContent(form.unit_label);

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
          {mode === 'edit' && canWrite && onRegisterMovement ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              disabled={saving}
              onClick={onRegisterMovement}
            >
              Registrar entrada
            </button>
          ) : null}
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
      <div className="hub-clientes-drawer__content hub-estoque-drawer">
        <form id={INVENTORY_FORM_ID} onSubmit={onSubmit}>
          <section className="hub-estoque-drawer__section">
            <h3 className="hub-estoque-drawer__section-title">Informações gerais</h3>
            <div className="hub-clientes__field">
              <span className="hub-clientes__label" id="inv-kind-label">
                Tipo *
              </span>
              {allowKindChange ? (
                <HubEstoqueFilterChips
                  ariaLabel="Tipo do item"
                  value={form.item_kind}
                  options={KIND_OPTIONS}
                  onChange={(id) => setForm((f) => ({ ...f, item_kind: id }))}
                />
              ) : (
                <p className="hub-estoque__kind-readonly">
                  <span className={`hub-estoque__kind hub-estoque__kind--${activeKind}`}>{kindLabel(activeKind)}</span>
                </p>
              )}
            </div>
            <div className="hub-clientes__field">
              <label className="hub-clientes__label" htmlFor="inv-name">
                Nome *
              </label>
              <input
                id="inv-name"
                className="hub-clientes__input"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Antipulgas, Ração premium…"
              />
            </div>
            <div className="hub-estoque-drawer__row">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-ean">
                  EAN / código de barras
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
                <p className="hub-estoque__hint-ean">Leitor USB: foque aqui e escaneie.</p>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-sku">
                  SKU da loja
                </label>
                <input
                  id="inv-sku"
                  className="hub-clientes__input"
                  value={form.store_sku}
                  onChange={(e) => setForm((f) => ({ ...f, store_sku: e.target.value }))}
                  placeholder="Ex.: PROD-001"
                />
              </div>
            </div>
            <div className="hub-estoque-drawer__row">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-unit">
                  Unidade de medida
                </label>
                <HubSearchableCombobox
                  id="inv-unit"
                  className="hub-combobox--clientes"
                  options={unitOptions}
                  value={form.unit_label}
                  onChange={(v) =>
                    setForm((f) => {
                      const next = { ...f, unit_label: v };
                      if (!stockUnitShowsContentFields(v)) {
                        next.content_qty = '';
                        next.content_unit = '';
                      } else if (stockUnitRequiresContent(v) && !f.content_unit.trim()) {
                        next.content_unit = 'ml';
                      }
                      return next;
                    })
                  }
                  placeholder="Selecionar unidade"
                  searchPlaceholder="Buscar ou criar unidade…"
                  allowCreate={canWrite}
                  createEntityLabel="unidade"
                  createEntityGender="f"
                  emptyResultsLabel="Nenhuma unidade encontrada"
                  ariaLabel="Unidade de medida"
                />
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-purpose">
                  Finalidade
                </label>
                <HubSearchableCombobox
                  id="inv-purpose"
                  className="hub-combobox--clientes"
                  options={purposeOptions}
                  value={form.sale_purpose}
                  onChange={(v) => setForm((f) => ({ ...f, sale_purpose: v }))}
                  placeholder="Selecionar finalidade"
                  searchPlaceholder="Buscar ou criar finalidade…"
                  allowCreate={canWrite}
                  createEntityLabel="finalidade"
                  createEntityGender="f"
                  emptyResultsLabel="Nenhuma finalidade encontrada"
                  ariaLabel="Finalidade"
                />
              </div>
            </div>
            {showContentFields ? (
              <div className="hub-estoque-drawer__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="inv-content-qty">
                    Conteúdo por {form.unit_label.trim() || 'unidade'}
                    {contentRequired ? ' *' : ''}
                  </label>
                  <input
                    id="inv-content-qty"
                    className="hub-clientes__input"
                    inputMode="decimal"
                    required={contentRequired}
                    value={form.content_qty}
                    onChange={(e) => setForm((f) => ({ ...f, content_qty: e.target.value }))}
                    placeholder="Ex.: 10"
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="inv-content-unit">
                    Unidade do conteúdo
                    {contentRequired ? ' *' : ''}
                  </label>
                  <HubSearchableCombobox
                    id="inv-content-unit"
                    className="hub-combobox--clientes"
                    options={contentUnitOptions}
                    value={form.content_unit}
                    onChange={(v) => setForm((f) => ({ ...f, content_unit: v }))}
                    placeholder="Ex.: ml"
                    searchPlaceholder="Buscar unidade…"
                    allowCreate={canWrite}
                    createEntityLabel="unidade de conteúdo"
                    createEntityGender="f"
                    emptyResultsLabel="Nenhuma unidade encontrada"
                    ariaLabel="Unidade do conteúdo"
                  />
                </div>
              </div>
            ) : null}
            <div className="hub-clientes__field">
              <HubCheckbox
                checked={form.allow_fractional || Boolean(form.content_qty.trim())}
                onChange={(allow_fractional) => setForm((f) => ({ ...f, allow_fractional }))}
              >
                Permite quantidades fracionadas
              </HubCheckbox>
              {activeKind === 'medication' ? (
                <p className="hub-estoque__hint-ean" style={{ marginTop: 8 }}>
                  {showContentFields
                    ? 'Na consulta, informe a quantidade na unidade do conteúdo (ex.: ml). O sistema converte e baixa a fração do frasco/ampola. A cobrança do tutor é o serviço de aplicação, não o preço de venda deste item.'
                    : 'Na consulta, a Qtd. baixada usa a mesma unidade deste cadastro. A cobrança do tutor é o serviço de aplicação, não o preço de venda deste item.'}
                </p>
              ) : null}
            </div>
          </section>

          <section className="hub-estoque-drawer__section">
            <h3 className="hub-estoque-drawer__section-title">Categorização</h3>
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
                createEntityGender="m"
                emptyResultsLabel="Nenhum grupo encontrado"
                ariaLabel="Grupo de produto"
              />
              <p className="hub-estoque__hint-ean">Sugestões comuns do tipo; você pode criar outro grupo.</p>
            </div>
            <div className="hub-estoque-drawer__row">
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
                  placeholder="Selecionar ou buscar"
                  searchPlaceholder="Buscar fabricante…"
                  allowCreate={canWrite}
                  createEntityLabel="fabricante"
                  createEntityGender="m"
                  emptyResultsLabel="Nenhum fabricante encontrado"
                  ariaLabel="Fabricante"
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
                  placeholder="Selecionar ou buscar"
                  searchPlaceholder="Buscar fornecedor…"
                  allowCreate={canWrite}
                  createEntityLabel="fornecedor"
                  createEntityGender="m"
                  emptyResultsLabel="Nenhum fornecedor encontrado"
                  ariaLabel="Fornecedor"
                />
              </div>
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
                placeholder="Observações internas, apresentação, concentração…"
              />
            </div>
          </section>

          <section className="hub-estoque-drawer__section">
            <h3 className="hub-estoque-drawer__section-title">Preços</h3>
            <div className="hub-estoque-drawer__row">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-cost">
                  Valor de custo *
                </label>
                <div className="hub-estoque-drawer__affix">
                  <span className="hub-estoque-drawer__affix-prefix">R$</span>
                  <input
                    id="inv-cost"
                    className="hub-clientes__input"
                    required
                    value={form.cost_amount}
                    onChange={(e) => setForm((f) => ({ ...f, cost_amount: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-sale">
                  Valor de venda *
                </label>
                <div className="hub-estoque-drawer__affix">
                  <span className="hub-estoque-drawer__affix-prefix">R$</span>
                  <input
                    id="inv-sale"
                    className="hub-clientes__input"
                    required
                    value={form.sale_amount}
                    onChange={(e) => setForm((f) => ({ ...f, sale_amount: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
            <div className="hub-estoque-drawer__row">
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-sup-disc">
                  Desconto fornecedor
                </label>
                <div className="hub-estoque-drawer__affix">
                  <input
                    id="inv-sup-disc"
                    className="hub-clientes__input"
                    value={form.supplier_discount_pct}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_discount_pct: e.target.value }))}
                  />
                  <span className="hub-estoque-drawer__affix-suffix">%</span>
                </div>
              </div>
              <div className="hub-clientes__field">
                <label className="hub-clientes__label" htmlFor="inv-max-disc">
                  Desconto máximo na venda
                </label>
                <div className="hub-estoque-drawer__affix">
                  <input
                    id="inv-max-disc"
                    className="hub-clientes__input"
                    value={form.max_sale_discount_pct}
                    onChange={(e) => setForm((f) => ({ ...f, max_sale_discount_pct: e.target.value }))}
                  />
                  <span className="hub-estoque-drawer__affix-suffix">%</span>
                </div>
              </div>
            </div>
            <div className="hub-estoque-drawer__checks">
              <HubCheckbox
                checked={form.allow_price_override_on_sale}
                onChange={(allow_price_override_on_sale) =>
                  setForm((f) => ({ ...f, allow_price_override_on_sale }))
                }
              >
                Permite alterar o preço durante a venda
              </HubCheckbox>
              <HubCheckbox
                checked={form.generates_staff_commission}
                onChange={(generates_staff_commission) =>
                  setForm((f) => ({ ...f, generates_staff_commission }))
                }
              >
                Gera comissão para funcionários
              </HubCheckbox>
            </div>
          </section>

          <section className="hub-estoque-drawer__section">
            <h3 className="hub-estoque-drawer__section-title">Estoque</h3>
            <div className="hub-estoque-drawer__row">
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
                <HubSearchableCombobox
                  id="inv-alert"
                  className="hub-combobox--clientes"
                  options={ALERT_OPTIONS}
                  value={form.expiry_alert_policy}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, expiry_alert_policy: (v || 'none') as HubExpiryAlertPolicy }))
                  }
                  placeholder="Selecionar alerta"
                  searchPlaceholder="Buscar política…"
                  clearable={false}
                  ariaLabel="Alerta de vencimento"
                />
              </div>
            </div>
          </section>

          {mode === 'create' && (
            <section className="hub-estoque-drawer__section hub-estoque-drawer__section--lot">
              <h3 className="hub-estoque-drawer__section-title">Lote inicial</h3>
              <p className="hub-estoque-drawer__section-lead">
                Opcional. Preencha a quantidade para já entrar com estoque.
              </p>
              <div className="hub-estoque-drawer__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="inv-recv">
                    Data de entrada
                  </label>
                  <HubDateField
                    id="inv-recv"
                    valueIso={form.initial_received_at}
                    onChangeIso={(iso) =>
                      setForm((f) => ({ ...f, initial_received_at: iso || new Date().toISOString().slice(0, 10) }))
                    }
                    showTodayButton={false}
                  />
                </div>
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="inv-exp">
                    Data de validade
                  </label>
                  <HubDateField
                    id="inv-exp"
                    valueIso={form.initial_expiry_date}
                    onChangeIso={(iso) => setForm((f) => ({ ...f, initial_expiry_date: iso }))}
                    showTodayButton={false}
                  />
                </div>
              </div>
              <div className="hub-estoque-drawer__row">
                <div className="hub-clientes__field">
                  <label className="hub-clientes__label" htmlFor="inv-iqty">
                    Quantidade
                  </label>
                  <input
                    id="inv-iqty"
                    className="hub-clientes__input"
                    value={form.initial_qty}
                    onChange={(e) => setForm((f) => ({ ...f, initial_qty: e.target.value }))}
                    placeholder="Deixe vazio para cadastrar sem estoque"
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
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </section>
          )}
        </form>
      </div>
    </HubSidePanel>
  );
};

export default HubEstoqueItemDrawer;
