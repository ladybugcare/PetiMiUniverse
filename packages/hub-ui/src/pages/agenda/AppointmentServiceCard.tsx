import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  comboValueToVariant,
  matrixNeedsVariantChoice,
  variantComboboxOptionsForMatrix,
  variantToComboValue,
} from '../../utils/hubPricingVariantUi';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  coercePricingMatrixFromApi,
  type CoatTypeValue,
  type HubServicePricingMatrix,
  type PorteValue,
} from '../../utils/hubServiceTypesPricingMatrix';
import { normalizeServiceGroupSlug, serviceGroupLabel } from '../../utils/serviceTypeSlug';
import {
  addonMetaLabel,
  addonNeedsVariantOnRow,
  type AppointmentServiceChip,
} from './appointmentAddonsUtils';
import type { AgendaPricingPreviewLine } from './agendaPortePricingPreview';

export type AppointmentServiceCardProps = {
  idPrefix: string;
  chip: AppointmentServiceChip;
  serviceIndex: number;
  serviceType: HubServiceType | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onRemove: () => void;
  onDurationChange: (minutes: number) => void;
  /** Adicionais disponíveis para este serviço pai. */
  parentAddons: HubServiceType[];
  addonsLoading: boolean;
  selectedAddons: AppointmentServiceChip[];
  onAddonToggle: (addon: HubServiceType) => void;
  onAddonVariantChange: (addonId: string, variant: HubQuotePricingVariant | null) => void;
  /** Matriz de variante de preço (consulta/personalizado/etc.). */
  variantMatrix: HubServicePricingMatrix | null;
  onVariantChange: (variant: HubQuotePricingVariant | null) => void;
  /** Linha de estimativa de preço para este serviço. */
  pricingLine: AgendaPricingPreviewLine | null;
  /** Valor cobrado neste agendamento (override / especial). */
  onSaleAmountChange?: (amount: number | null) => void;
  onPersistSpecialChange?: (persist: boolean, scope: 'pet' | 'guardian') => void;
  showSpecialPriceControls?: boolean;
  /** Override de porte/pelagem deste agendamento — só em serviços com tabela por porte/pelagem. */
  tableOverride?: ServiceTableOverride;
};

export type ServiceTableOverride = {
  porteOptions?: HubComboboxOption[];
  porteValue?: string;
  onPorteChange?: (value: string) => void;
  coatOptions?: HubComboboxOption[];
  coatValue?: string;
  onCoatChange?: (value: string) => void;
  puppyMaxMonths?: number;
  coatRequired?: boolean;
  coatRequiredHint?: string;
};

const EMPTY_ADDONS_HINT =
  'Nenhum adicional disponível para este serviço. Configure em Serviços → Adicionais ou na disponibilidade do serviço.';

function formatPrice(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function splitVariantLabel(label: string): { name: string; price: string } {
  const idx = label.lastIndexOf(' — ');
  if (idx === -1) return { name: label, price: '' };
  return { name: label.slice(0, idx).trim(), price: label.slice(idx + 3).trim() };
}

function NamVariantChips({
  options,
  value,
  onChange,
  labelledBy,
}: {
  options: HubComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  labelledBy?: string;
}) {
  return (
    <div className="nam-variant-chips" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((opt) => {
        const active = opt.value === value;
        const { name, price } = splitVariantLabel(opt.label);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`nam-variant-chip${active ? ' nam-variant-chip--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="nam-variant-chip__name">{name}</span>
            {price ? <span className="nam-variant-chip__price">{price}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function pricingAttrTags(line: AgendaPricingPreviewLine): string[] {
  if (line.isAddon) return [];
  const tags: string[] = [];
  if (line.tierApplied) tags.push(PORTE_LABELS[line.tierApplied as PorteValue] ?? line.tierApplied);
  if (line.coatTypeApplied) {
    tags.push(COAT_TYPE_LABELS[line.coatTypeApplied as CoatTypeValue] ?? line.coatTypeApplied);
  }
  if (line.needsCoatType) tags.push('Selecione a pelagem');
  return tags;
}

export function serviceUsesPorteCoatMatrix(st: HubServiceType | undefined): {
  porte: boolean;
  coat: boolean;
} {
  const m = st ? coercePricingMatrixFromApi(st.pricing_matrix) : null;
  if (!m) return { porte: false, coat: false };
  return {
    porte: m.kind === 'porte' || m.kind === 'porte_pelagem',
    coat: m.kind === 'pelagem' || m.kind === 'porte_pelagem',
  };
}

function specialScopeHint(
  hint: NonNullable<AppointmentServiceChip['special_price_hint']>,
): string {
  if (hint.scope === 'family_plan' && hint.family_total != null) {
    return `Plano família · ${formatPrice(hint.family_total)} / ${hint.family_pet_count ?? '?'} pets`;
  }
  if (hint.scope === 'guardian') return 'Acordo do tutor';
  return 'Acordo deste pet';
}

export const AppointmentServiceCard: React.FC<AppointmentServiceCardProps> = ({
  idPrefix,
  chip,
  serviceIndex,
  serviceType,
  expanded,
  onToggleExpand,
  onRemove,
  onDurationChange,
  parentAddons,
  addonsLoading,
  selectedAddons,
  onAddonToggle,
  onAddonVariantChange,
  variantMatrix,
  onVariantChange,
  pricingLine,
  onSaleAmountChange,
  onPersistSpecialChange,
  showSpecialPriceControls = false,
  tableOverride,
}) => {
  const groupSlug = normalizeServiceGroupSlug(serviceType?.service_group);
  const groupLabel = serviceGroupLabel(groupSlug);
  const hasVariant = Boolean(variantMatrix);
  const hasAddons = parentAddons.length > 0;
  const displaySale =
    chip.sale_amount_override != null && Number.isFinite(chip.sale_amount_override)
      ? Number(chip.sale_amount_override)
      : pricingLine?.sale ?? null;
  const hint = chip.special_price_hint;
  const catalogSale = hint?.catalog_sale ?? pricingLine?.sale ?? null;
  const hasExistingSpecial = Boolean(hint);
  const [specialEditorOpen, setSpecialEditorOpen] = useState(
    () => hasExistingSpecial || Boolean(chip.persist_special_price),
  );

  useEffect(() => {
    // Só abre automaticamente quando chega um acordo já salvo para o pet.
    if (hasExistingSpecial) setSpecialEditorOpen(true);
  }, [hasExistingSpecial, chip.hub_service_type_id]);

  const headerSale = specialEditorOpen ? displaySale : pricingLine?.sale ?? displaySale;
  const usesTable = serviceUsesPorteCoatMatrix(serviceType);
  const showPorteField = Boolean(usesTable.porte && tableOverride?.onPorteChange && tableOverride.porteOptions);
  const showCoatField = Boolean(usesTable.coat && tableOverride?.onCoatChange && tableOverride.coatOptions);
  const showTable = showPorteField || showCoatField;
  const appliedTags = pricingLine && !hasVariant && !showTable ? pricingAttrTags(pricingLine) : [];

  return (
    <div className={`nam-service-card ${expanded ? 'nam-service-card--expanded' : 'nam-service-card--collapsed'}`}>
      <div className="nam-service-card__header">
        <button
          type="button"
          className="nam-service-card__expand"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? 'Recolher serviço' : 'Expandir serviço'}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div className="nam-service-card__title-wrap">
          <span className="nam-service-card__name">{chip.name}</span>
          <span className="nam-service-card__group-badge">{groupLabel}</span>
        </div>
        <div className="nam-service-card__duration">
          <input
            className="nam-service-card__dur-input"
            type="number"
            min={1}
            max={480}
            value={chip.duration_minutes}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            aria-label={`Duração de ${chip.name} em minutos`}
          />
          <span className="nam-service-card__dur-unit">min</span>
        </div>
        {pricingLine && !expanded ? (
          <span className="nam-service-card__header-price">
            {formatPrice(headerSale ?? pricingLine.sale)}
            {specialEditorOpen && hint ? (
              <span style={{ display: 'block', fontSize: 10, fontWeight: 500, opacity: 0.75 }}>especial</span>
            ) : null}
          </span>
        ) : null}
        <button
          type="button"
          className="nam-service-card__remove"
          onClick={onRemove}
          aria-label={`Remover ${chip.name}`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded ? (
        <div className="nam-service-card__body">
          {hasVariant && variantMatrix ? (
            <div className="nam-service-card__section">
              <p className="nam-service-card__section-label" id={`${idPrefix}-variant-label-${serviceIndex}`}>
                Tabela de preço
              </p>
              <NamVariantChips
                labelledBy={`${idPrefix}-variant-label-${serviceIndex}`}
                options={variantComboboxOptionsForMatrix(variantMatrix)}
                value={variantToComboValue(variantMatrix, chip.pricing_variant ?? null)}
                onChange={(raw) => {
                  const v = comboValueToVariant(variantMatrix, raw);
                  onVariantChange(v);
                }}
              />
            </div>
          ) : null}

          {pricingLine || (showSpecialPriceControls && onSaleAmountChange) || showTable ? (
            <div className="nam-service-card__section nam-price-block">
              <p className="nam-service-card__section-label">Preço estimado</p>
              {appliedTags.length > 0 ? (
                <div className="nam-price-block__tags">
                  {appliedTags.map((tag) => (
                    <span
                      key={tag}
                      className={`nam-price-tag${tag === 'Selecione a pelagem' ? ' nam-price-tag--warn' : ''}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="nam-price-block__amount">
                {specialEditorOpen && catalogSale != null && catalogSale !== (headerSale ?? catalogSale) ? (
                  <span className="nam-price-block__catalog">{formatPrice(catalogSale)}</span>
                ) : null}
                <strong className="nam-price-block__sale">
                  {formatPrice(headerSale ?? pricingLine?.sale ?? displaySale ?? 0)}
                </strong>
                {specialEditorOpen ? <span className="nam-price-block__badge">Especial</span> : null}
              </div>

              {showTable && tableOverride ? (
                <div className="nam-price-table">
                  <p className="nam-price-table__title">Como calcular {groupLabel}</p>
                  <div
                    className={`nam-price-table__fields${
                      showPorteField && showCoatField ? '' : ' nam-price-table__fields--single'
                    }`}
                  >
                    {showPorteField ? (
                      <label className="nam-price-table__field" htmlFor={`${idPrefix}-pricing-porte-${serviceIndex}`}>
                        <span>Porte</span>
                        <select
                          id={`${idPrefix}-pricing-porte-${serviceIndex}`}
                          className="nam-price-table__select"
                          value={tableOverride.porteValue ?? ''}
                          onChange={(e) => tableOverride.onPorteChange?.(e.target.value)}
                        >
                          {(tableOverride.porteOptions ?? []).map((opt) => (
                            <option key={opt.value || 'auto'} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {showCoatField ? (
                      <label className="nam-price-table__field" htmlFor={`${idPrefix}-pricing-coat-${serviceIndex}`}>
                        <span>Pelagem</span>
                        <select
                          id={`${idPrefix}-pricing-coat-${serviceIndex}`}
                          className="nam-price-table__select"
                          value={tableOverride.coatValue ?? ''}
                          onChange={(e) => tableOverride.onCoatChange?.(e.target.value)}
                        >
                          {(tableOverride.coatOptions ?? []).map((opt) => (
                            <option key={opt.value || 'auto'} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  {pricingLine && (pricingLine.tierApplied || pricingLine.coatTypeApplied) ? (
                    <p className="nam-price-table__applied">
                      Neste agendamento:{' '}
                      {[
                        pricingLine.tierApplied
                          ? (PORTE_LABELS[pricingLine.tierApplied as PorteValue] ?? pricingLine.tierApplied)
                          : null,
                        pricingLine.coatTypeApplied
                          ? (COAT_TYPE_LABELS[pricingLine.coatTypeApplied as CoatTypeValue] ??
                            pricingLine.coatTypeApplied)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  {showPorteField && tableOverride.puppyMaxMonths != null ? (
                    <p className="nam-price-table__hint">
                      Filhote nesta clínica: até {tableOverride.puppyMaxMonths} meses na data do agendamento.
                    </p>
                  ) : null}
                  {showCoatField && tableOverride.coatRequired ? (
                    <p className="nam-footer-error nam-price-table__error">
                      <AlertCircle size={14} />{' '}
                      {tableOverride.coatRequiredHint ?? 'Selecione a pelagem para precificar este serviço.'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showSpecialPriceControls && onSaleAmountChange ? (
                <div className="nam-price-block__special">
                  <HubCheckbox
                    checked={specialEditorOpen}
                    onChange={(checked) => {
                      setSpecialEditorOpen(checked);
                      if (!checked) {
                        if (hint) {
                          onSaleAmountChange(catalogSale ?? pricingLine?.sale ?? null);
                        } else {
                          onSaleAmountChange(null);
                        }
                        onPersistSpecialChange?.(false, chip.persist_special_scope ?? 'pet');
                      } else if (hint) {
                        onSaleAmountChange(hint.special_sale);
                      } else if (pricingLine != null) {
                        onSaleAmountChange(pricingLine.sale);
                      }
                    }}
                  >
                    {hasExistingSpecial ? 'Usar valor especial neste serviço' : 'Adicionar valor especial'}
                  </HubCheckbox>

                  {specialEditorOpen ? (
                    <div className="nam-price-block__special-body">
                      {hint ? (
                        <p className="nam-price-block__hint">
                          {specialScopeHint(hint)} · salvo {formatPrice(hint.special_sale)}
                        </p>
                      ) : (
                        <p className="nam-price-block__hint">
                          Vale só neste agendamento
                          {catalogSale != null ? ` · catálogo ${formatPrice(catalogSale)}` : ''}.
                        </p>
                      )}
                      <label className="nam-price-input">
                        <span className="nam-price-input__prefix">R$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={displaySale ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              onSaleAmountChange(null);
                              return;
                            }
                            const n = Number(raw);
                            onSaleAmountChange(Number.isFinite(n) ? n : null);
                          }}
                          aria-label={`Valor especial de ${chip.name}`}
                        />
                      </label>
                      {onPersistSpecialChange && !hasExistingSpecial ? (
                        <HubCheckbox
                          checked={Boolean(chip.persist_special_price)}
                          onChange={(checked) =>
                            onPersistSpecialChange(checked, chip.persist_special_scope ?? 'pet')
                          }
                        >
                          Salvar para os próximos agendamentos deste pet
                        </HubCheckbox>
                      ) : null}
                      {onPersistSpecialChange && hasExistingSpecial ? (
                        <HubCheckbox
                          checked={Boolean(chip.persist_special_price)}
                          onChange={(checked) =>
                            onPersistSpecialChange(checked, chip.persist_special_scope ?? 'pet')
                          }
                        >
                          Atualizar o preço especial salvo com este valor
                        </HubCheckbox>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="nam-service-card__section">
            {hasAddons ? (
              <>
                <p className="nam-service-card__section-label">Extras disponíveis</p>
                <ul className="nam-addon-list">
                  {parentAddons.map((addon) => {
                    const addonChip = selectedAddons.find((s) => s.hub_service_type_id === addon.id);
                    const checked = Boolean(addonChip);
                    const variantRow = checked ? addonNeedsVariantOnRow(addon, addonChip) : null;
                    const variantOptions = variantRow
                      ? variantComboboxOptionsForMatrix(variantRow.matrix)
                      : [];
                    const selectedVariantValue = variantRow
                      ? variantToComboValue(variantRow.matrix, addonChip?.pricing_variant ?? null)
                      : '';
                    const selectedVariant = variantOptions.find((o) => o.value === selectedVariantValue);
                    const selectedPrice = selectedVariant
                      ? splitVariantLabel(selectedVariant.label).price
                      : '';
                    const baseMeta = addonMetaLabel(addon);
                    const meta =
                      checked && selectedPrice
                        ? [addon.default_duration_minutes != null ? `${addon.default_duration_minutes} min` : '', selectedPrice]
                            .filter(Boolean)
                            .join(' · ')
                        : baseMeta;
                    return (
                      <li key={addon.id} className="nam-addon-row">
                        <HubCheckbox
                          className="nam-addon-row__check"
                          checked={checked}
                          onChange={() => onAddonToggle(addon)}
                        >
                          <span className="nam-addon-row__name">{addon.name}</span>
                          {meta ? <span className="nam-addon-row__meta">{meta}</span> : null}
                        </HubCheckbox>
                        {variantRow ? (
                          <NamVariantChips
                            options={variantOptions}
                            value={selectedVariantValue}
                            onChange={(raw) => {
                              const v = comboValueToVariant(variantRow.matrix, raw);
                              onAddonVariantChange(addon.id, v);
                            }}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p
                className="nam-service-card__addons-compact"
                title={addonsLoading ? undefined : EMPTY_ADDONS_HINT}
              >
                <span className="nam-service-card__section-label">Extras</span>
                {addonsLoading ? (
                  <>
                    <Loader2 size={13} className="nam-addon-section__spinner" aria-hidden />
                    <span className="nam-service-card__addons-empty">Carregando…</span>
                  </>
                ) : (
                  <span className="nam-service-card__addons-empty">Nenhum disponível</span>
                )}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** Hook auxiliar: controla qual card está expandido (último adicionado por padrão). */
export function useServiceCardExpansion(serviceIds: string[]) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prevCountRef = useRef(serviceIds.length);

  useEffect(() => {
    if (serviceIds.length > prevCountRef.current) {
      setExpandedId(serviceIds[serviceIds.length - 1] ?? null);
    } else if (expandedId && !serviceIds.includes(expandedId)) {
      setExpandedId(serviceIds[serviceIds.length - 1] ?? null);
    }
    prevCountRef.current = serviceIds.length;
  }, [serviceIds, expandedId]);

  return {
    expandedId,
    setExpandedId,
    isExpanded: (id: string) => expandedId === id,
    toggle: (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
  };
}

export function mergeAddonsByParent(
  results: Array<{ parentId: string; addons: HubServiceType[] }>,
): Map<string, HubServiceType[]> {
  const map = new Map<string, HubServiceType[]>();
  for (const { parentId, addons } of results) {
    map.set(parentId, addons);
  }
  return map;
}

export function allUniqueAddons(map: Map<string, HubServiceType[]>): HubServiceType[] {
  const byId = new Map<string, HubServiceType>();
  for (const addons of map.values()) {
    for (const a of addons) {
      if (!byId.has(a.id)) byId.set(a.id, a);
    }
  }
  return [...byId.values()];
}

export function serviceNeedsVariantMatrix(
  chip: AppointmentServiceChip,
  serviceTypes: HubServiceType[],
): HubServicePricingMatrix | null {
  const st = serviceTypes.find((x) => x.id === chip.hub_service_type_id);
  if (!st) return null;
  const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
  if (!matrix || !matrixNeedsVariantChoice(matrix)) return null;
  return matrix;
}
