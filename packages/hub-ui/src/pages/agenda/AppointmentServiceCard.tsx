import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
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
};

const EMPTY_ADDONS_HINT =
  'Nenhum adicional disponível para este serviço. Configure em Serviços → Adicionais ou na disponibilidade do serviço.';

function formatPrice(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pricingSummaryLabel(line: AgendaPricingPreviewLine): string {
  if (line.isAddon) return formatPrice(line.sale);
  const parts: string[] = [];
  if (line.tierApplied) parts.push(PORTE_LABELS[line.tierApplied as PorteValue] ?? line.tierApplied);
  if (line.coatTypeApplied) {
    parts.push(COAT_TYPE_LABELS[line.coatTypeApplied as CoatTypeValue] ?? line.coatTypeApplied);
  }
  if (line.needsCoatType) parts.push('selecione pelagem');
  const meta = parts.length > 0 ? `${parts.join(' · ')} · ` : '';
  return `${meta}${formatPrice(line.sale)}`;
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
}) => {
  const groupSlug = normalizeServiceGroupSlug(serviceType?.service_group);
  const groupLabel = serviceGroupLabel(groupSlug);
  const hasVariant = Boolean(variantMatrix);
  const hasAddons = parentAddons.length > 0;

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
          <span className="nam-service-card__header-price">{formatPrice(pricingLine.sale)}</span>
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
              <p className="nam-service-card__section-label">Tabela de preço</p>
              <HubSearchableCombobox
                id={`${idPrefix}-variant-${serviceIndex}`}
                options={variantComboboxOptionsForMatrix(variantMatrix)}
                value={variantToComboValue(variantMatrix, chip.pricing_variant ?? null)}
                onChange={(raw) => {
                  const v = comboValueToVariant(variantMatrix, raw);
                  onVariantChange(v);
                }}
                clearable={false}
                placeholder="Selecione a opção"
              />
            </div>
          ) : pricingLine ? (
            <div className="nam-service-card__section">
              <p className="nam-service-card__section-label">Preço estimado</p>
              <p className="nam-service-card__price-line">{pricingSummaryLabel(pricingLine)}</p>
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
                    const meta = addonMetaLabel(addon);
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
                          <div className="nam-addon-row__variant">
                            <HubSearchableCombobox
                              id={`${idPrefix}-addon-variant-${addon.id}`}
                              options={variantComboboxOptionsForMatrix(variantRow.matrix)}
                              value={variantToComboValue(variantRow.matrix, addonChip?.pricing_variant ?? null)}
                              onChange={(raw) => {
                                const v = comboValueToVariant(variantRow.matrix, raw);
                                onAddonVariantChange(addon.id, v);
                              }}
                              clearable={false}
                              placeholder="Selecione a opção"
                            />
                          </div>
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
