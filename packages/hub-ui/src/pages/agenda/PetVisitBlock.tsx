import React, { useCallback, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  defaultPricingVariantForMatrix,
  matrixNeedsVariantChoice,
} from '../../utils/hubPricingVariantUi';
import {
  COAT_TYPE_LABELS,
  PORTE_LABELS,
  PET_BODY_PORTE_VALUES,
  type CoatTypeValue,
  type PetBodyPorteValue,
  type PorteValue,
  coercePricingMatrixFromApi,
} from '../../utils/hubServiceTypesPricingMatrix';
import { normalizeServiceGroupSlug } from '../../utils/serviceTypeSlug';
import {
  buildAgendaPricingPreview,
  unionCoatTypesForServiceSelection,
  unionPorteTiersForServiceSelection,
} from './agendaPortePricingPreview';
import {
  AppointmentServiceCard,
  serviceNeedsVariantMatrix,
  useServiceCardExpansion,
} from './AppointmentServiceCard';
import {
  addMinutes,
  cloneExtraBlocks,
  createEmptyExtraBlock,
  type ExtraBlock,
  type SchedulingServiceChip,
} from './appointmentSchedulingUtils';
import { ExtraBlockCard } from './ExtraBlockCard';

export type PetVisitServiceChip = SchedulingServiceChip;

export type PetVisitConfig = {
  petId: string;
  expanded: boolean;
  services: PetVisitServiceChip[];
  selectedAddons: PetVisitServiceChip[];
  pricingApptPorteTier: string;
  pricingApptCoatType: string;
  hubStaffMemberId: string;
  extraBlocks: ExtraBlock[];
  startsHmOverride?: string;
  endsHmOverride?: string;
};

export function emptyPetVisitConfig(petId: string, expanded = false, staffId = ''): PetVisitConfig {
  return {
    petId,
    expanded,
    services: [],
    selectedAddons: [],
    pricingApptPorteTier: '',
    pricingApptCoatType: '',
    hubStaffMemberId: staffId,
    extraBlocks: [],
  };
}

export function clonePetVisitConfig(cfg: PetVisitConfig): PetVisitConfig {
  return {
    ...cfg,
    services: cfg.services.map((s) => ({ ...s })),
    selectedAddons: cfg.selectedAddons.map((a) => ({ ...a })),
    extraBlocks: cloneExtraBlocks(cfg.extraBlocks),
  };
}

type PetVisitBlockProps = {
  blockNumber: number;
  petName: string;
  petSizeTier: string;
  petCoatType: string | null;
  petBirthDate: string | null;
  config: PetVisitConfig;
  onChange: (config: PetVisitConfig) => void;
  groups: HubComboboxOption[];
  groupFilter: string;
  onGroupFilterChange: (value: string) => void;
  serviceTypes: HubServiceType[];
  addonsByParent: Map<string, HubServiceType[]>;
  addonsLoading: boolean;
  dateYmd: string;
  puppyMaxMonths: number;
  showStaffField: boolean;
  showTimeFields: boolean;
  staffComboOptions: HubComboboxOption[];
  computedStartHm: string;
  computedEndHm: string;
  defaultResourceLabel: string;
};

export const PetVisitBlock: React.FC<PetVisitBlockProps> = ({
  blockNumber,
  petName,
  petSizeTier,
  petCoatType,
  petBirthDate,
  config,
  onChange,
  groups,
  groupFilter,
  onGroupFilterChange,
  serviceTypes,
  addonsByParent,
  addonsLoading,
  dateYmd,
  puppyMaxMonths,
  showStaffField,
  showTimeFields,
  staffComboOptions,
  computedStartHm,
  computedEndHm,
  defaultResourceLabel,
}) => {
  const [serviceSearchId, setServiceSearchId] = useState('');

  const serviceComboOptions = useMemo<HubComboboxOption[]>(() => {
    const filtered = serviceTypes.filter(
      (st) =>
        st.allow_scheduling !== false &&
        (groupFilter === 'all' || normalizeServiceGroupSlug(st.service_group) === groupFilter),
    );
    return filtered.map((st) => ({
      value: st.id,
      label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}`,
    }));
  }, [serviceTypes, groupFilter]);

  const cardExpansion = useServiceCardExpansion(config.services.map((s) => s.hub_service_type_id));

  const bodyTier =
    petSizeTier && PET_BODY_PORTE_VALUES.includes(petSizeTier as PetBodyPorteValue)
      ? petSizeTier
      : 'medio';

  const serviceIds = useMemo(
    () => config.services.map((s) => s.hub_service_type_id),
    [config.services],
  );

  const unionPricingTiers = useMemo(
    () => unionPorteTiersForServiceSelection(serviceIds, serviceTypes),
    [serviceIds, serviceTypes],
  );

  const unionPricingCoatTypes = useMemo(
    () => unionCoatTypesForServiceSelection(serviceIds, serviceTypes),
    [serviceIds, serviceTypes],
  );

  const pricingPreview = useMemo(
    () =>
      buildAgendaPricingPreview({
        mainServices: [
          ...config.services.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: false as const,
          })),
          ...config.selectedAddons.map((s) => ({
            hub_service_type_id: s.hub_service_type_id,
            name: s.name,
            pricing_variant: s.pricing_variant,
            sale_amount_override: s.sale_amount_override,
            isAddon: true as const,
          })),
        ],
        extraServices: [],
        serviceTypes,
        petSizeTier: bodyTier,
        petBirthDate,
        petCoatType,
        appointmentDateYmd: dateYmd,
        puppyMaxMonths,
        appointmentOverrideTier: config.pricingApptPorteTier.trim() || null,
        appointmentOverrideCoatType: config.pricingApptCoatType.trim() || null,
      }),
    [config, serviceTypes, bodyTier, petBirthDate, petCoatType, dateYmd, puppyMaxMonths],
  );

  const pricingLineByServiceId = useMemo(() => {
    const map = new Map<string, (typeof pricingPreview.lines)[0]>();
    for (const ln of pricingPreview.lines) {
      if (!ln.isAddon) map.set(ln.hub_service_type_id, ln);
    }
    return map;
  }, [pricingPreview.lines]);

  const needsManualCoatType = pricingPreview.lines.some((ln) => ln.needsCoatType);
  const showPricingOverrides = unionPricingTiers.length > 0 || unionPricingCoatTypes.length > 0;

  const servicesDurationMin = config.services.reduce((s, c) => s + c.duration_minutes, 0);
  const addonsDurationMin = config.selectedAddons.reduce((s, c) => s + c.duration_minutes, 0);
  const totalDurationMin = servicesDurationMin + addonsDurationMin;

  const patch = useCallback(
    (partial: Partial<PetVisitConfig>) => onChange({ ...config, ...partial }),
    [config, onChange],
  );

  const addService = (id: string) => {
    if (!id) return;
    const st = serviceTypes.find((s) => s.id === id);
    if (!st || config.services.some((s) => s.hub_service_type_id === id)) {
      setServiceSearchId('');
      return;
    }
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    patch({
      services: [
        ...config.services,
        {
          hub_service_type_id: id,
          name: st.name,
          duration_minutes: st.default_duration_minutes ?? 60,
          pricing_variant,
        },
      ],
    });
    setServiceSearchId('');
  };

  const removeService = (idx: number) =>
    patch({ services: config.services.filter((_, i) => i !== idx) });

  const updateServiceDuration = (idx: number, dur: number) =>
    patch({
      services: config.services.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s)),
    });

  const updateServiceVariant = (idx: number, variant: HubQuotePricingVariant | null) =>
    patch({
      services: config.services.map((s, i) => (i === idx ? { ...s, pricing_variant: variant } : s)),
    });

  const toggleAddon = (addon: HubServiceType) => {
    if (config.selectedAddons.some((s) => s.hub_service_type_id === addon.id)) {
      patch({
        selectedAddons: config.selectedAddons.filter((s) => s.hub_service_type_id !== addon.id),
      });
      return;
    }
    const matrix = coercePricingMatrixFromApi(addon.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    patch({
      selectedAddons: [
        ...config.selectedAddons,
        {
          hub_service_type_id: addon.id,
          name: addon.name,
          duration_minutes: addon.default_duration_minutes ?? 15,
          pricing_variant,
        },
      ],
    });
  };

  const updateAddonVariant = (addonId: string, variant: HubQuotePricingVariant | null) =>
    patch({
      selectedAddons: config.selectedAddons.map((s) =>
        s.hub_service_type_id === addonId ? { ...s, pricing_variant: variant } : s,
      ),
    });

  const pricingTierComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático (idade + porte do pet)' };
    return [auto, ...unionPricingTiers.map((t) => ({ value: t, label: PORTE_LABELS[t] }))];
  }, [unionPricingTiers]);

  const pricingCoatComboOptions = useMemo<HubComboboxOption[]>(() => {
    const auto: HubComboboxOption = { value: '', label: 'Automático (pelagem do pet)' };
    return [auto, ...unionPricingCoatTypes.map((t) => ({ value: t, label: COAT_TYPE_LABELS[t] }))];
  }, [unionPricingCoatTypes]);

  const addExtraBlock = () => {
    const collapsed = config.extraBlocks.map((b) => ({ ...b, expanded: false }));
    patch({
      extraBlocks: [
        ...collapsed,
        createEmptyExtraBlock({
          groupFilter: groupFilter,
          startsHm: computedEndHm,
          staffId: config.hubStaffMemberId,
          resourceLabel: defaultResourceLabel,
        }),
      ],
    });
  };

  const removeExtraBlock = (key: string) =>
    patch({ extraBlocks: config.extraBlocks.filter((b) => b.key !== key) });

  const updateExtraBlock = (key: string, updated: ExtraBlock) =>
    patch({
      extraBlocks: config.extraBlocks.map((b) => (b.key === key ? updated : b)),
    });

  const toggleExtraBlockExpand = (key: string) =>
    patch({
      extraBlocks: config.extraBlocks.map((b) =>
        b.key === key ? { ...b, expanded: !b.expanded } : b,
      ),
    });

  const headerTitle = `${petName} · ${computedStartHm}–${computedEndHm}`;

  return (
    <div className="nam-section nam-block-card nam-pet-visit-block">
      <div className={`nam-block-card__header-row${config.expanded ? '' : ' nam-block-card__header-row--collapsed'}`}>
        <button
          type="button"
          className="nam-block-card__header"
          onClick={() => patch({ expanded: !config.expanded })}
        >
          <span className="nam-block-card__header-left">
            <span className="nam-block-card__badge" aria-hidden>
              {blockNumber}
            </span>
            <span className="nam-block-card__title">{headerTitle}</span>
          </span>
          <span className="nam-block-card__toggle">
            {config.expanded ? 'Recolher' : 'Expandir'}
            {config.expanded ? (
              <ChevronUp size={16} strokeWidth={2.5} />
            ) : (
              <ChevronDown size={16} strokeWidth={2.5} />
            )}
          </span>
        </button>
      </div>

      {config.expanded ? (
        <div className="nam-block-card__body">
          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Grupo de serviço</label>
                <HubSearchableCombobox
                  id={`nam-pet-group-${config.petId}`}
                  options={groups}
                  value={groupFilter}
                  onChange={onGroupFilterChange}
                  clearable={false}
                  placeholder="Todos os grupos"
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Serviços</label>
                <HubSearchableCombobox
                  id={`nam-pet-svc-${config.petId}`}
                  options={serviceComboOptions}
                  value={serviceSearchId}
                  onChange={addService}
                  placeholder="Buscar e adicionar serviço…"
                  clearable={false}
                  markedValues={config.services.map((s) => s.hub_service_type_id)}
                />
              </div>
            </div>

            {config.services.length > 0 ? (
              <div className="nam-service-cards">
                {config.services.map((chip, idx) => (
                  <AppointmentServiceCard
                    key={chip.hub_service_type_id}
                    idPrefix={`nam-pet-${config.petId}`}
                    chip={chip}
                    serviceIndex={idx}
                    serviceType={serviceTypes.find((st) => st.id === chip.hub_service_type_id)}
                    expanded={cardExpansion.isExpanded(chip.hub_service_type_id)}
                    onToggleExpand={() => cardExpansion.toggle(chip.hub_service_type_id)}
                    onRemove={() => removeService(idx)}
                    onDurationChange={(dur) => updateServiceDuration(idx, dur)}
                    parentAddons={addonsByParent.get(chip.hub_service_type_id) ?? []}
                    addonsLoading={addonsLoading}
                    selectedAddons={config.selectedAddons}
                    onAddonToggle={toggleAddon}
                    onAddonVariantChange={updateAddonVariant}
                    variantMatrix={serviceNeedsVariantMatrix(chip, serviceTypes)}
                    onVariantChange={(v) => updateServiceVariant(idx, v)}
                    pricingLine={pricingLineByServiceId.get(chip.hub_service_type_id) ?? null}
                  />
                ))}
                <div className="nam-chips__duration-breakdown">
                  Total: <strong>{totalDurationMin} min</strong>
                </div>
              </div>
            ) : (
              <p className="nam-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                Nenhum serviço para {petName}. Busque acima para adicionar.
              </p>
            )}
          </div>

          {showStaffField ? (
            <div className="nam-section">
              <div className="nam-field">
                <label className="nam-label">Profissional</label>
                <HubSearchableCombobox
                  id={`nam-pet-staff-${config.petId}`}
                  options={staffComboOptions}
                  value={config.hubStaffMemberId}
                  onChange={(v) => patch({ hubStaffMemberId: v })}
                  placeholder="Não atribuído"
                  clearable={false}
                />
              </div>
            </div>
          ) : null}

          {showTimeFields ? (
            <div className="nam-section">
              <div className="nam-row nam-row--cols2">
                <div className="nam-field">
                  <label className="nam-label">Início</label>
                  <input
                    className="nam-input"
                    type="time"
                    value={config.startsHmOverride ?? computedStartHm}
                    onChange={(e) => patch({ startsHmOverride: e.target.value })}
                  />
                </div>
                <div className="nam-field">
                  <label className="nam-label">Fim previsto</label>
                  <input
                    className="nam-input"
                    type="time"
                    value={config.endsHmOverride ?? computedEndHm}
                    onChange={(e) => patch({ endsHmOverride: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {showPricingOverrides ? (
            <div className="nam-section nam-section--pricing-overrides">
              <div className="nam-row nam-row--cols2">
                {unionPricingTiers.length > 0 ? (
                  <div className="nam-field">
                    <label className="nam-label">Preço por porte</label>
                    <HubSearchableCombobox
                      id={`nam-pet-porte-${config.petId}`}
                      options={pricingTierComboOptions}
                      value={config.pricingApptPorteTier}
                      onChange={(v) => patch({ pricingApptPorteTier: v })}
                      placeholder="Automático"
                      clearable={false}
                    />
                  </div>
                ) : null}
                {unionPricingCoatTypes.length > 0 ? (
                  <div className="nam-field">
                    <label className="nam-label">Preço por pelagem</label>
                    <HubSearchableCombobox
                      id={`nam-pet-coat-${config.petId}`}
                      options={pricingCoatComboOptions}
                      value={config.pricingApptCoatType}
                      onChange={(v) => patch({ pricingApptCoatType: v })}
                      placeholder="Automático"
                      clearable={false}
                    />
                    {needsManualCoatType ? (
                      <p className="nam-footer-error" style={{ marginTop: 6 }}>
                        <AlertCircle size={14} /> Pelagem obrigatória para {petName}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {config.extraBlocks.length > 0 ? (
            <div className="nam-section nam-pet-extra-blocks">
              {config.extraBlocks.map((block, ebIdx) => (
                <ExtraBlockCard
                  key={block.key}
                  block={block}
                  index={ebIdx}
                  blockNumber={ebIdx + 2}
                  groups={groups}
                  staffComboOptions={staffComboOptions}
                  serviceTypes={serviceTypes}
                  onRemove={() => removeExtraBlock(block.key)}
                  onChange={(updated) => updateExtraBlock(block.key, updated)}
                  onToggleExpand={() => toggleExtraBlockExpand(block.key)}
                />
              ))}
            </div>
          ) : null}

          <div className="nam-section">
            <button className="nam-btn-add-block" type="button" onClick={addExtraBlock}>
              <Plus size={14} /> Adicionar outro bloco para {petName}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PetVisitBlock;
