import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers, Package, Plus, Receipt, Trash2 } from 'lucide-react';
import { getStoredClinicId } from '@petimi/web-core';
import { hubPackagesApi } from '../../api/hubPackagesApi';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import { hubServiceTypesApi, type HubServiceType } from '../../api/hubServiceTypesApi';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubCheckbox } from '../../components/HubCheckbox';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import '../clientes/clientes.css';
import '../orcamentos/orcamentos-page.css';
import { normalizeServiceGroupSlug, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import {
  coercePricingMatrixFromApi,
  type HubServicePricingMatrix,
} from '../../utils/hubServiceTypesPricingMatrix';
import {
  comboValueToVariant,
  defaultPricingVariantForMatrix,
  matrixNeedsVariantChoice,
  variantComboboxOptionsForMatrix,
  variantToComboValue,
} from '../../utils/hubPricingVariantUi';
import './servicos-page.css';

type ItemRow = {
  hub_service_type_id: string;
  quantity: string;
  service_name?: string;
  service_group?: string;
  is_addon?: boolean;
  pricing_variant?: HubQuotePricingVariant | null;
};

function variantShortLabel(matrix: HubServicePricingMatrix, v: HubQuotePricingVariant | null | undefined): string {
  const opts = variantComboboxOptionsForMatrix(matrix);
  const val = variantToComboValue(matrix, v ?? null);
  const label = opts.find((o) => o.value === val)?.label ?? '';
  return label.split(' — ')[0]?.trim() ?? '';
}

function buildGroupOptions(types: HubServiceType[]): HubComboboxOption[] {
  const seen = new Set<string>();
  const opts: HubComboboxOption[] = [{ value: 'all', label: 'Todos os grupos' }];
  for (const st of types) {
    const slug = normalizeServiceGroupSlug(st.service_group);
    if (!seen.has(slug)) {
      seen.add(slug);
      opts.push({ value: slug, label: serviceGroupLabel(slug) });
    }
  }
  return opts.sort((a, b) => {
    if (a.value === 'all') return -1;
    if (b.value === 'all') return 1;
    return a.label.localeCompare(b.label, 'pt-BR');
  });
}

function buildCatalogOptions(
  types: HubServiceType[],
  groupFilter: string,
  selectedIds: readonly string[] = [],
): HubComboboxOption[] {
  const filtered = types.filter(
    (st) => groupFilter === 'all' || normalizeServiceGroupSlug(st.service_group) === groupFilter,
  );
  const seen = new Set(filtered.map((st) => st.id));
  for (const id of selectedIds) {
    if (!id || seen.has(id)) continue;
    const st = types.find((t) => t.id === id);
    if (st) {
      filtered.push(st);
      seen.add(id);
    }
  }
  const sorted = [...filtered].sort((a, b) => {
    const ga = serviceGroupLabel(normalizeServiceGroupSlug(a.service_group));
    const gb = serviceGroupLabel(normalizeServiceGroupSlug(b.service_group));
    const cmp = ga.localeCompare(gb, 'pt-BR');
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  return [
    { value: '', label: '— Selecionar —' },
    ...sorted.map((st) => ({
      value: st.id,
      label: `${serviceGroupLabel(normalizeServiceGroupSlug(st.service_group))} · ${st.name}`,
    })),
  ];
}

function formatCompositionLabel(row: ItemRow, catalogById: Map<string, HubServiceType>): string {
  const qty = parseQty(row.quantity);
  const name = row.service_name ?? 'item';
  const group = row.service_group ? serviceGroupLabel(normalizeServiceGroupSlug(row.service_group)) : null;
  const st = row.hub_service_type_id ? catalogById.get(row.hub_service_type_id) : undefined;
  const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
  const variantSuffix =
    matrix && matrixNeedsVariantChoice(matrix) && row.pricing_variant
      ? ` (${variantShortLabel(matrix, row.pricing_variant)})`
      : '';
  const base = group ? `${group} · ${name}` : name;
  return `${qty}× ${base}${variantSuffix}`;
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function parseQty(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseMoney(s: string): number {
  return parseFloat(s.replace(',', '.')) || 0;
}

const PACKAGE_DESCRIPTION_MAX = 3000;

function buildSuggestedPackageDescription(
  rows: ItemRow[],
  catalogById: Map<string, HubServiceType>,
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.hub_service_type_id || seen.has(row.hub_service_type_id)) continue;
    seen.add(row.hub_service_type_id);
    const st = catalogById.get(row.hub_service_type_id);
    const desc = st?.description?.trim();
    if (!desc) continue;
    const qty = parseQty(row.quantity);
    const label = row.service_name ?? st?.name ?? 'Serviço';
    parts.push(qty > 1 ? `${qty}× ${label}: ${desc}` : `${label}: ${desc}`);
  }
  return parts.join('\n\n').slice(0, PACKAGE_DESCRIPTION_MAX);
}

const HubPackageFormPage: React.FC = () => {
  const { id: packageId } = useParams<{ id: string }>();
  const isEdit = Boolean(packageId);
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<HubServiceType[]>([]);
  const [addonTypes, setAddonTypes] = useState<HubServiceType[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const descriptionTouchedRef = useRef(false);
  const [serviceItems, setServiceItems] = useState<ItemRow[]>([{ hub_service_type_id: '', quantity: '1' }]);
  const [addonItems, setAddonItems] = useState<ItemRow[]>([]);
  const [serviceGroupFilter, setServiceGroupFilter] = useState('all');
  const [addonGroupFilter, setAddonGroupFilter] = useState('all');
  const [pricingMode, setPricingMode] = useState<'manual' | 'catalog_sum'>('catalog_sum');
  const [manualPrice, setManualPrice] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [discountPercent, setDiscountPercent] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [catalogSubtotal, setCatalogSubtotal] = useState(0);
  const [suggestedPrice, setSuggestedPrice] = useState(0);

  const mainServices = useMemo(
    () => serviceTypes.filter((s) => !s.deleted_at && s.active !== false && !s.is_addon),
    [serviceTypes]
  );

  const addonServices = useMemo(
    () => addonTypes.filter((s) => !s.deleted_at && s.active !== false && s.is_addon),
    [addonTypes]
  );

  const catalogById = useMemo(() => {
    const map = new Map<string, HubServiceType>();
    for (const s of mainServices) map.set(s.id, s);
    for (const a of addonServices) map.set(a.id, a);
    return map;
  }, [mainServices, addonServices]);

  const serviceGroupOptions = useMemo(() => buildGroupOptions(mainServices), [mainServices]);
  const addonGroupOptions = useMemo(() => buildGroupOptions(addonServices), [addonServices]);

  const serviceCatalogOptions = useMemo(
    () =>
      buildCatalogOptions(
        mainServices,
        serviceGroupFilter,
        serviceItems.map((r) => r.hub_service_type_id),
      ),
    [mainServices, serviceGroupFilter, serviceItems],
  );

  const addonCatalogOptions = useMemo(
    () =>
      buildCatalogOptions(
        addonServices,
        addonGroupFilter,
        addonItems.map((r) => r.hub_service_type_id),
      ),
    [addonServices, addonGroupFilter, addonItems],
  );

  const allItems = useMemo(() => [...serviceItems, ...addonItems], [serviceItems, addonItems]);

  const suggestedDescription = useMemo(
    () => buildSuggestedPackageDescription(allItems, catalogById),
    [allItems, catalogById],
  );

  useEffect(() => {
    if (descriptionTouchedRef.current) return;
    setDescription(suggestedDescription);
  }, [suggestedDescription]);

  const fillDescriptionFromServices = useCallback(() => {
    setDescription(suggestedDescription);
    descriptionTouchedRef.current = false;
  }, [suggestedDescription]);

  const validItemRows = useMemo(
    () => allItems.filter((it) => it.hub_service_type_id),
    [allItems],
  );

  const totalSessions = useMemo(
    () => validItemRows.reduce((sum, it) => sum + parseQty(it.quantity), 0),
    [validItemRows]
  );

  const packageKindLabel = validItemRows.length <= 1 ? 'Simples' : 'Combo';

  const finalPrice =
    pricingMode === 'catalog_sum' ? suggestedPrice : parseMoney(manualPrice);

  const loadCatalog = useCallback(async () => {
    if (!clinicId) return;
    const validItems = allItems
      .filter((it) => it.hub_service_type_id)
      .map((it) => ({
        hub_service_type_id: it.hub_service_type_id,
        quantity: parseQty(it.quantity),
        pricing_variant: it.pricing_variant ?? null,
      }));
    if (!validItems.length) {
      setCatalogSubtotal(0);
      setSuggestedPrice(0);
      return;
    }
    try {
      const res = await hubPackagesApi.suggestPrice({
        clinic_id: clinicId,
        items: validItems,
        discount_amount: parseMoney(discountAmount),
        discount_percent: discountPercent ? parseMoney(discountPercent) : null,
      });
      setCatalogSubtotal(res.catalog_subtotal);
      setSuggestedPrice(res.suggested_price);
      if (pricingMode === 'catalog_sum') setManualPrice(String(res.suggested_price));
    } catch {
      /* ignore while typing */
    }
  }, [clinicId, allItems, discountAmount, discountPercent, pricingMode]);

  useEffect(() => {
    const t = setTimeout(() => void loadCatalog(), 300);
    return () => clearTimeout(t);
  }, [loadCatalog]);

  useEffect(() => {
    if (!clinicId) return;
    void Promise.all([
      hubServiceTypesApi.list(clinicId),
      hubServiceTypesApi.list(clinicId, false, false, true),
    ]).then(([mainRes, addonRes]) => {
      setServiceTypes(mainRes.service_types);
      setAddonTypes(addonRes.service_types);
    });
  }, [clinicId]);

  useEffect(() => {
    if (!catalogById.size) return;
    const enrich = (rows: ItemRow[]): ItemRow[] =>
      rows.map((row) => {
        if (!row.hub_service_type_id) return row;
        const st = catalogById.get(row.hub_service_type_id);
        if (!st) return row;
        return {
          ...row,
          service_name: st.name,
          service_group: st.service_group ?? undefined,
          is_addon: Boolean(st.is_addon),
          pricing_variant:
            row.pricing_variant ??
            (() => {
              const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
              return matrix && matrixNeedsVariantChoice(matrix)
                ? defaultPricingVariantForMatrix(matrix)
                : null;
            })(),
        };
      });
    setServiceItems((prev) => enrich(prev));
    setAddonItems((prev) => enrich(prev));
  }, [catalogById]);

  useEffect(() => {
    if (!isEdit || !clinicId || !packageId) return;
    setLoading(true);
    void hubPackagesApi
      .get(clinicId, packageId)
      .then(({ package: pkg }) => {
        setName(pkg.name);
        setDescription(pkg.description ?? '');
        descriptionTouchedRef.current = Boolean(pkg.description?.trim());
        const loaded = (pkg.items ?? []).map((it) => ({
          hub_service_type_id: it.hub_service_type_id,
          quantity: String(it.quantity),
          service_name: it.service_name ?? undefined,
          is_addon: it.is_addon,
          pricing_variant: it.pricing_variant ?? null,
        }));
        const services = loaded.filter((it) => !it.is_addon);
        const addons = loaded.filter((it) => it.is_addon);
        setServiceItems(services.length ? services : [{ hub_service_type_id: '', quantity: '1' }]);
        setAddonItems(addons);
        setPricingMode(pkg.pricing_mode);
        setManualPrice(String(pkg.price));
        setDiscountAmount(String(pkg.discount_amount ?? 0));
        setDiscountPercent(pkg.discount_percent != null ? String(pkg.discount_percent) : '');
        setValidityDays(pkg.validity_days != null ? String(pkg.validity_days) : '');
        setNotes(pkg.notes ?? '');
        setActive(pkg.active);
        setCatalogSubtotal(Number(pkg.catalog_subtotal ?? 0));
        setSuggestedPrice(Number(pkg.price ?? 0));
      })
      .catch((e: Error) => showError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, clinicId, packageId, showError]);

  const patchRowFromCatalog = (row: ItemRow, patch: Partial<ItemRow>, isAddon: boolean): ItemRow => {
    const next = { ...row, ...patch, is_addon: isAddon };
    if (patch.hub_service_type_id) {
      const st = catalogById.get(patch.hub_service_type_id);
      next.service_name = st?.name;
      next.service_group = st?.service_group ?? undefined;
      next.is_addon = isAddon;
      const matrix = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
      next.pricing_variant =
        matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    }
    if (patch.pricing_variant !== undefined) {
      next.pricing_variant = patch.pricing_variant;
    }
    return next;
  };

  const addServiceRow = () =>
    setServiceItems((prev) => [...prev, { hub_service_type_id: '', quantity: '1', is_addon: false }]);
  const removeServiceRow = (idx: number) =>
    setServiceItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  const updateServiceRow = (idx: number, patch: Partial<ItemRow>) => {
    setServiceItems((prev) =>
      prev.map((row, i) => (i === idx ? patchRowFromCatalog(row, patch, false) : row)),
    );
  };

  const addAddonRow = () =>
    setAddonItems((prev) => [...prev, { hub_service_type_id: '', quantity: '1', is_addon: true }]);
  const removeAddonRow = (idx: number) => setAddonItems((prev) => prev.filter((_, i) => i !== idx));
  const updateAddonRow = (idx: number, patch: Partial<ItemRow>) => {
    setAddonItems((prev) =>
      prev.map((row, i) => (i === idx ? patchRowFromCatalog(row, patch, true) : row)),
    );
  };

  const renderVariantField = (
    row: ItemRow,
    idPrefix: string,
    onVariantChange: (v: HubQuotePricingVariant | null) => void,
  ) => {
    if (!row.hub_service_type_id) return null;
    const st = catalogById.get(row.hub_service_type_id);
    if (!st) return null;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    if (!matrix || !matrixNeedsVariantChoice(matrix)) return null;
    const opts = variantComboboxOptionsForMatrix(matrix);
    const comboVal = variantToComboValue(matrix, row.pricing_variant ?? null);
    return (
      <div className="hub-package-form__item-variant">
        <label className="hub-orcamento-novo__label" htmlFor={`${idPrefix}-variant`}>
          Opção de preço
        </label>
        <HubSearchableCombobox
          id={`${idPrefix}-variant`}
          className="hub-orcamento-novo__service-combobox"
          options={opts}
          value={comboVal}
          onChange={(v) => onVariantChange(comboValueToVariant(matrix, v))}
          clearable={false}
          placeholder="Selecionar opção…"
          searchPlaceholder="Buscar…"
          ariaLabel="Opção de preço do item"
        />
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId) return;
    const combined = [...serviceItems, ...addonItems];
    const validItems = combined
      .filter((it) => it.hub_service_type_id)
      .map((it, idx) => ({
        hub_service_type_id: it.hub_service_type_id,
        quantity: parseQty(it.quantity),
        sort_order: idx,
        pricing_variant: it.pricing_variant ?? null,
      }));
    if (!name.trim() || !validItems.length) {
      showError('Informe o nome e ao menos um serviço ou adicional.');
      return;
    }
    setSaving(true);
    try {
      const basePayload = {
        clinic_id: clinicId,
        name: name.trim(),
        items: validItems,
        pricing_mode: pricingMode,
        price: pricingMode === 'manual' ? parseMoney(manualPrice) : suggestedPrice,
        discount_amount: parseMoney(discountAmount),
        discount_percent: discountPercent ? parseMoney(discountPercent) : null,
        validity_days: validityDays ? parseInt(validityDays, 10) : null,
        description: description.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEdit && packageId) {
        await hubPackagesApi.update(packageId, { ...basePayload, active });
        showSuccess('Pacote atualizado.');
      } else {
        await hubPackagesApi.create(basePayload);
        showSuccess('Pacote criado.');
      }
      navigate('/hub/servicos/pacotes');
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar pacote');
    } finally {
      setSaving(false);
    }
  };

  if (!clinicId) return <p className="hub-clientes__muted">Selecione uma clínica.</p>;
  if (loading) return <HubLoading variant="block" label="Carregando pacote…" />;

  const pageTitle = isEdit ? 'Editar pacote' : 'Novo pacote';
  const pageSubtitle = isEdit
    ? 'Atualize a composição, preço e validade do pacote.'
    : 'Monte um pacote pré-pago com serviços e adicionais do catálogo e defina o preço de venda.';

  return (
    <div className="hub-orcamento-novo hub-package-form hub-servicos-page">
      <header className="hub-orcamento-novo__topbar">
        <div>
          <Link to="/hub/servicos/pacotes" className="hub-package-form__back">
            <ArrowLeft size={16} aria-hidden />
            Voltar aos pacotes
          </Link>
          <h1 className="hub-orcamento-novo__topbar-title">{pageTitle}</h1>
          <p className="hub-orcamento-novo__topbar-subtitle">{pageSubtitle}</p>
        </div>
        <div className="hub-orcamento-novo__topbar-actions">
          <HubCancelButton onClick={() => navigate('/hub/servicos/pacotes')} disabled={saving} />
          <button
            type="submit"
            form="hub-package-form"
            className="hub-orcamento-novo__btn hub-orcamento-novo__btn--primary"
            disabled={saving}
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar pacote'}
          </button>
        </div>
      </header>

      <form id="hub-package-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="hub-orcamento-novo__grid">
          <div className="hub-orcamento-novo__main">
            <section className="hub-orcamento-novo__card">
              <div className="hub-orcamento-novo__card-header">
                <div>
                  <h2 className="hub-orcamento-novo__card-title">Identificação</h2>
                  <p className="hub-orcamento-novo__card-subtitle">
                    Nome e descrição exibidos na venda; notas internas ficam na seção de precificação.
                  </p>
                </div>
              </div>
              <div className="hub-orcamento-novo__field hub-orcamento-novo__field--wide">
                <label className="hub-orcamento-novo__label" htmlFor="pkg-name">
                  Nome do pacote
                </label>
                <input
                  id="pkg-name"
                  className="hub-orcamento-novo__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Pacote 5 banhos"
                  required
                />
              </div>
              <div className="hub-orcamento-novo__field hub-orcamento-novo__field--wide hub-package-form__description-field">
                <div className="hub-package-form__description-head">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-description">
                    Descrição do pacote
                  </label>
                  {suggestedDescription ? (
                    <button
                      type="button"
                      className="hub-package-form__description-fill-btn"
                      onClick={fillDescriptionFromServices}
                    >
                      Preencher a partir dos serviços
                    </button>
                  ) : null}
                </div>
                <textarea
                  id="pkg-description"
                  className="hub-orcamento-novo__textarea"
                  rows={4}
                  maxLength={PACKAGE_DESCRIPTION_MAX}
                  value={description}
                  onChange={(e) => {
                    descriptionTouchedRef.current = true;
                    setDescription(e.target.value);
                  }}
                  placeholder="Opcional — descreva o que está incluído. Ao adicionar serviços com descrição no catálogo, o texto é sugerido automaticamente."
                />
                <p className="hub-orcamento-novo__help">
                  Você pode editar, complementar ou substituir o texto sugerido pelos serviços avulsos.
                </p>
                <p className="hub-orcamento-novo__char-count">
                  {description.length}/{PACKAGE_DESCRIPTION_MAX}
                </p>
              </div>
              {isEdit ? (
                <div className="hub-package-form__active-row">
                  <HubCheckbox checked={active} onChange={setActive}>
                    Pacote ativo (disponível para venda)
                  </HubCheckbox>
                </div>
              ) : null}
            </section>

            <section className="hub-orcamento-novo__card">
              <div className="hub-orcamento-novo__card-header">
                <div>
                  <h2 className="hub-orcamento-novo__card-title">Itens incluídos</h2>
                  <p className="hub-orcamento-novo__card-subtitle">
                    Escolha serviços avulsos e/ou adicionais do catálogo, com a quantidade de sessões de cada um.
                  </p>
                </div>
              </div>

              <div className="hub-package-form__items-block">
                <div className="hub-package-form__items-block-header">
                  <h3 className="hub-package-form__items-block-title">Serviços</h3>
                  <button
                    type="button"
                    className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline hub-package-form__add-btn"
                    onClick={addServiceRow}
                  >
                    <Plus size={16} aria-hidden />
                    Adicionar serviço
                  </button>
                </div>

                <div className="hub-package-form__group-filter">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-service-group">
                    Grupo de serviço
                  </label>
                  <HubSearchableCombobox
                    id="pkg-service-group"
                    className="hub-orcamento-novo__service-combobox"
                    options={serviceGroupOptions}
                    value={serviceGroupFilter}
                    onChange={setServiceGroupFilter}
                    clearable={false}
                    placeholder="Todos os grupos"
                    searchPlaceholder="Buscar grupo…"
                    ariaLabel="Filtrar serviços por grupo"
                  />
                </div>

                <div className="hub-package-form__items">
                  <div className="hub-package-form__items-head" aria-hidden>
                    <span>Serviço</span>
                    <span>Qtd.</span>
                    <span />
                  </div>
                  <ul className="hub-package-form__items-list">
                    {serviceItems.map((row, idx) => (
                      <li key={`svc-${idx}`} className="hub-package-form__item-row">
                        <div className="hub-package-form__item-service">
                          <HubSearchableCombobox
                            id={`pkg-svc-${idx}`}
                            className="hub-orcamento-novo__service-combobox"
                            options={serviceCatalogOptions}
                            value={row.hub_service_type_id}
                            onChange={(v) => updateServiceRow(idx, { hub_service_type_id: v })}
                            placeholder="Buscar e selecionar serviço…"
                            searchPlaceholder="Buscar por grupo ou nome…"
                            ariaLabel="Serviço do pacote"
                          />
                          {renderVariantField(row, `pkg-svc-${idx}`, (v) =>
                            updateServiceRow(idx, { pricing_variant: v }),
                          )}
                        </div>
                        <div className="hub-package-form__item-qty">
                          <label
                            className="hub-orcamento-novo__label hub-package-form__qty-label"
                            htmlFor={`pkg-svc-qty-${idx}`}
                          >
                            Qtd.
                          </label>
                          <input
                            id={`pkg-svc-qty-${idx}`}
                            className="hub-orcamento-novo__input hub-package-form__qty-input"
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) => updateServiceRow(idx, { quantity: e.target.value })}
                            aria-label="Quantidade de sessões"
                          />
                        </div>
                        {serviceItems.length > 1 ? (
                          <button
                            type="button"
                            className="hub-package-form__item-remove-btn"
                            onClick={() => removeServiceRow(idx)}
                            aria-label="Remover serviço"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <span className="hub-package-form__item-remove-spacer" aria-hidden />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="hub-package-form__items-block hub-package-form__items-block--addons">
                <div className="hub-package-form__items-block-header">
                  <h3 className="hub-package-form__items-block-title">Adicionais</h3>
                  <button
                    type="button"
                    className="hub-orcamento-novo__btn hub-orcamento-novo__btn--outline hub-package-form__add-btn"
                    onClick={addAddonRow}
                  >
                    <Plus size={16} aria-hidden />
                    Adicionar adicional
                  </button>
                </div>

                <div className="hub-package-form__group-filter">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-addon-group">
                    Grupo de serviço
                  </label>
                  <HubSearchableCombobox
                    id="pkg-addon-group"
                    className="hub-orcamento-novo__service-combobox"
                    options={addonGroupOptions}
                    value={addonGroupFilter}
                    onChange={setAddonGroupFilter}
                    clearable={false}
                    placeholder="Todos os grupos"
                    searchPlaceholder="Buscar grupo…"
                    ariaLabel="Filtrar adicionais por grupo"
                  />
                </div>

                {addonItems.length > 0 ? (
                  <div className="hub-package-form__items">
                    <div className="hub-package-form__items-head" aria-hidden>
                      <span>Adicional</span>
                      <span>Qtd.</span>
                      <span />
                    </div>
                    <ul className="hub-package-form__items-list">
                      {addonItems.map((row, idx) => (
                        <li key={`addon-${idx}`} className="hub-package-form__item-row">
                          <div className="hub-package-form__item-service">
                            <HubSearchableCombobox
                              id={`pkg-addon-${idx}`}
                              className="hub-orcamento-novo__service-combobox"
                              options={addonCatalogOptions}
                              value={row.hub_service_type_id}
                              onChange={(v) => updateAddonRow(idx, { hub_service_type_id: v })}
                              placeholder="Buscar e selecionar adicional…"
                              searchPlaceholder="Buscar por grupo ou nome…"
                              ariaLabel="Adicional do pacote"
                            />
                            {renderVariantField(row, `pkg-addon-${idx}`, (v) =>
                              updateAddonRow(idx, { pricing_variant: v }),
                            )}
                          </div>
                          <div className="hub-package-form__item-qty">
                            <label
                              className="hub-orcamento-novo__label hub-package-form__qty-label"
                              htmlFor={`pkg-addon-qty-${idx}`}
                            >
                              Qtd.
                            </label>
                            <input
                              id={`pkg-addon-qty-${idx}`}
                              className="hub-orcamento-novo__input hub-package-form__qty-input"
                              type="number"
                              min={1}
                              value={row.quantity}
                              onChange={(e) => updateAddonRow(idx, { quantity: e.target.value })}
                              aria-label="Quantidade de sessões"
                            />
                          </div>
                          <button
                            type="button"
                            className="hub-package-form__item-remove-btn"
                            onClick={() => removeAddonRow(idx)}
                            aria-label="Remover adicional"
                          >
                            <Trash2 size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="hub-package-form__items-empty">Nenhum adicional incluído neste pacote.</p>
                )}
              </div>

              <p className="hub-orcamento-novo__help hub-package-form__items-hint">
                Banho e tosa com preço por porte ou pelagem não exige pacote por tamanho: o saldo vale para qualquer pet.
                Itens com opções de preço distintas (ex.: escova própria vs. escova nova) exigem escolher a opção abaixo.
                No modo «Derivado do catálogo», serviços por porte/pelagem usam o menor tier como referência; opções
                explícitas usam o preço da opção selecionada.
              </p>
            </section>

            <section className="hub-orcamento-novo__card">
              <div className="hub-orcamento-novo__card-header">
                <div>
                  <h2 className="hub-orcamento-novo__card-title">Precificação</h2>
                  <p className="hub-orcamento-novo__card-subtitle">
                    Calcule pelo catálogo ou informe um valor fixo de venda.
                  </p>
                </div>
              </div>

              <div className="hub-package-form__pricing-mode">
                <span className="hub-orcamento-novo__label">Modo de preço</span>
                <div className="hub-servicos__seg" role="radiogroup" aria-label="Modo de preço">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pricingMode === 'catalog_sum'}
                    className={pricingMode === 'catalog_sum' ? 'hub-servicos__seg--active' : undefined}
                    onClick={() => setPricingMode('catalog_sum')}
                  >
                    Derivado do catálogo
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pricingMode === 'manual'}
                    className={pricingMode === 'manual' ? 'hub-servicos__seg--active' : undefined}
                    onClick={() => setPricingMode('manual')}
                  >
                    Preço manual
                  </button>
                </div>
              </div>

              <div className="hub-package-form__subtotal-banner">
                <Receipt size={18} aria-hidden />
                <span>
                  Subtotal catálogo: <strong>{formatBrl(catalogSubtotal)}</strong>
                </span>
              </div>

              <div className="hub-orcamento-novo__discount-fields">
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-discount-amount">
                    Desconto (R$)
                  </label>
                  <div className="hub-servicos__money-field">
                    <span className="hub-servicos__money-prefix">R$</span>
                    <input
                      id="pkg-discount-amount"
                      className="hub-clientes__input"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>
                </div>
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-discount-percent">
                    Desconto (%)
                  </label>
                  <input
                    id="pkg-discount-percent"
                    className="hub-orcamento-novo__input"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="Opcional"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="hub-orcamento-novo__field hub-package-form__final-price-field">
                <label className="hub-orcamento-novo__label" htmlFor="pkg-final-price">
                  Preço final de venda
                </label>
                <div className="hub-servicos__money-field hub-package-form__final-price-input">
                  <span className="hub-servicos__money-prefix">R$</span>
                  <input
                    id="pkg-final-price"
                    className="hub-clientes__input"
                    value={pricingMode === 'catalog_sum' ? String(suggestedPrice) : manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    readOnly={pricingMode === 'catalog_sum'}
                    inputMode="decimal"
                  />
                </div>
                {pricingMode === 'catalog_sum' ? (
                  <p className="hub-orcamento-novo__help">Calculado automaticamente a partir do catálogo e dos descontos.</p>
                ) : null}
              </div>

              <div className="hub-package-form__extras">
                <div className="hub-orcamento-novo__field">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-validity">
                    Validade (dias)
                  </label>
                  <input
                    id="pkg-validity"
                    className="hub-orcamento-novo__input"
                    value={validityDays}
                    onChange={(e) => setValidityDays(e.target.value)}
                    placeholder="Ex.: 90"
                    inputMode="numeric"
                  />
                  <p className="hub-orcamento-novo__help">Deixe em branco para pacote sem prazo de expiração.</p>
                </div>
                <div className="hub-orcamento-novo__field hub-orcamento-novo__field--wide">
                  <label className="hub-orcamento-novo__label" htmlFor="pkg-notes">
                    Notas internas
                  </label>
                  <textarea
                    id="pkg-notes"
                    className="hub-orcamento-novo__textarea"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Informações visíveis apenas para a equipe"
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="hub-orcamento-novo__sidebar">
            <section className="hub-orcamento-novo__card hub-package-form__summary">
              <div className="hub-package-form__summary-head">
                <span className="hub-package-form__summary-icon" aria-hidden>
                  <Package size={22} />
                </span>
                <div>
                  <h2 className="hub-orcamento-novo__card-title">Resumo do pacote</h2>
                  <p className="hub-orcamento-novo__card-subtitle">Prévia antes de salvar</p>
                </div>
              </div>

              <div className="hub-orcamento-novo__summary-row">
                <span>Nome</span>
                <span>{name.trim() || '—'}</span>
              </div>
              {description.trim() ? (
                <div className="hub-package-form__summary-description">
                  <p className="hub-orcamento-novo__summary-section-title">Descrição</p>
                  <p className="hub-package-form__summary-description-text">{description.trim()}</p>
                </div>
              ) : null}
              <div className="hub-orcamento-novo__summary-row">
                <span>Tipo</span>
                <span>{validItemRows.length ? packageKindLabel : '—'}</span>
              </div>
              <div className="hub-orcamento-novo__summary-row">
                <span>Sessões totais</span>
                <span>{validItemRows.length ? totalSessions : '—'}</span>
              </div>

              {validItemRows.length > 0 ? (
                <div className="hub-orcamento-novo__summary-section">
                  <p className="hub-orcamento-novo__summary-section-title">Composição</p>
                  <ul className="hub-package-form__composition">
                    {validItemRows.map((row, idx) => (
                      <li key={`${row.hub_service_type_id}-${idx}`}>
                        <Layers size={14} aria-hidden />
                        <span>{formatCompositionLabel(row, catalogById)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="hub-package-form__summary-empty">Adicione ao menos um serviço para ver a composição.</p>
              )}

              <div className="hub-orcamento-novo__summary-section">
                <p className="hub-orcamento-novo__summary-section-title">Valores</p>
                <div className="hub-orcamento-novo__summary-row">
                  <span>Subtotal catálogo</span>
                  <span>{formatBrl(catalogSubtotal)}</span>
                </div>
                {parseMoney(discountAmount) > 0 ? (
                  <div className="hub-orcamento-novo__summary-row hub-orcamento-novo__summary-row--discount">
                    <span>Desconto (R$)</span>
                    <span>− {formatBrl(parseMoney(discountAmount))}</span>
                  </div>
                ) : null}
                {discountPercent ? (
                  <div className="hub-orcamento-novo__summary-row hub-orcamento-novo__summary-row--discount">
                    <span>Desconto (%)</span>
                    <span>− {discountPercent}%</span>
                  </div>
                ) : null}
                <div className="hub-orcamento-novo__summary-row hub-orcamento-novo__summary-row--total">
                  <span>Preço de venda</span>
                  <span>{formatBrl(finalPrice)}</span>
                </div>
              </div>

              {validityDays ? (
                <div className="hub-orcamento-novo__summary-row">
                  <span>Validade</span>
                  <span>{validityDays} dias</span>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </form>
    </div>
  );
};

export default HubPackageFormPage;
