import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubDateField } from '../../components/HubDateField';
import { HubTimeField } from '../../components/HubTimeField';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  defaultPricingVariantForMatrix,
  matrixNeedsVariantChoice,
} from '../../utils/hubPricingVariantUi';
import { coercePricingMatrixFromApi } from '../../utils/hubServiceTypesPricingMatrix';
import {
  isCrecheServiceGroup,
  isHotelServiceGroup,
  normalizeServiceGroupSlug,
} from '../../utils/serviceTypeSlug';
import {
  AppointmentServiceCard,
  serviceNeedsVariantMatrix,
  useServiceCardExpansion,
} from './AppointmentServiceCard';
import { BlockCardHeader } from './BlockCardHeader';
import {
  addMinutes,
  applyExtraBlockAutoFields,
  buildBlockHeaderSubtitle,
  buildBlockTitleFromServices,
  buildServiceDescriptionBullets,
  defaultBlockPickup,
  defaultBlockRecurrence,
  type ExtraBlock,
} from './appointmentSchedulingUtils';
import { AppointmentResourceField } from './AppointmentResourceField';
import { BlockRecurrencePickupFields } from './BlockRecurrencePickupFields';
import { blockAnchorGroup, canAddServiceToBlock } from './appointmentBlockRules';

export type ExtraBlockCardProps = {
  block: ExtraBlock;
  index: number;
  blockNumber?: number;
  petName?: string | null;
  groups: HubComboboxOption[];
  staffComboOptions: HubComboboxOption[];
  serviceTypes: HubServiceType[];
  onRemove: () => void;
  onChange: (updated: ExtraBlock) => void;
  onToggleExpand: () => void;
  clinicId?: string | null;
  unitId?: string | null;
  /** Data âncora do agendamento (fallback quando o bloco não tem starts_date_ymd). */
  dateYmd?: string;
  /** Limites quando o bloco principal é hotel (entrada…saída). */
  minDateYmd?: string | null;
  maxDateYmd?: string | null;
  /** Esconde «Repetir» (ex.: extras dentro de estadia de hotel/creche). */
  hideRecurrence?: boolean;
  /** Esconde L&T neste bloco (L&T da visita ou regras de estadia). */
  hidePickup?: boolean;
  /** Aviso sob o L&T (ex.: acompanha cada ocorrência). */
  pickupHint?: string | null;
};

function clampYmd(iso: string, minYmd?: string | null, maxYmd?: string | null): string {
  let next = iso;
  if (minYmd && next && next < minYmd) next = minYmd;
  if (maxYmd && next && next > maxYmd) next = maxYmd;
  return next;
}

export const ExtraBlockCard: React.FC<ExtraBlockCardProps> = ({
  block,
  index,
  blockNumber,
  petName,
  groups,
  staffComboOptions,
  serviceTypes,
  onRemove,
  onChange,
  onToggleExpand,
  clinicId = null,
  unitId = null,
  dateYmd = '',
  minDateYmd = null,
  maxDateYmd = null,
  hideRecurrence = false,
  hidePickup = false,
  pickupHint = null,
}) => {
  const [svcSearchId, setSvcSearchId] = useState('');
  const displayBlockNumber = blockNumber ?? index + 2;
  const autoSyncedKeyRef = useRef<string | null>(null);

  const autoTitle = useMemo(
    () => buildBlockTitleFromServices(block.services.map((s) => s.name), petName),
    [block.services, petName],
  );

  // Garante título/descrição na abertura (edição ou bloco com serviços sem campos preenchidos).
  useEffect(() => {
    const svcSig = block.services.map((s) => s.hub_service_type_id).join('|');
    const sig = `${block.key}:${svcSig}:${petName ?? ''}`;
    if (autoSyncedKeyRef.current === sig) return;
    autoSyncedKeyRef.current = sig;
    if (block.services.length === 0) return;
    if (block.block_title_user_edited && block.block_description_user_edited) return;
    const next = applyExtraBlockAutoFields(block, serviceTypes, petName, { recalcEnds: false });
    if (
      next.block_title !== block.block_title ||
      next.block_description !== block.block_description
    ) {
      onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sincroniza só quando serviços/pet mudam
  }, [
    block.key,
    block.services,
    block.block_title,
    block.block_description,
    block.block_title_user_edited,
    block.block_description_user_edited,
    petName,
    serviceTypes,
  ]);

  const headerSubtitle = useMemo(
    () =>
      buildBlockHeaderSubtitle({
        startsHm: block.starts_hm,
        endsHm: block.ends_hm,
        durationMin: block.services.reduce((sum, s) => sum + s.duration_minutes, 0),
        serviceNames: block.services.map((s) => s.name),
      }),
    [block.starts_hm, block.ends_hm, block.services],
  );

  const anchorGroup = useMemo(
    () => blockAnchorGroup(
      block.services.map((s) => s.hub_service_type_id),
      serviceTypes,
    ),
    [block.services, serviceTypes],
  );
  const isHotelBlock = isHotelServiceGroup(anchorGroup);
  const isCrecheBlock = isCrecheServiceGroup(anchorGroup);
  const blockDateYmd = block.starts_date_ymd || dateYmd;

  const setBlockDate = (iso: string) => {
    const next = clampYmd(iso || dateYmd, minDateYmd, maxDateYmd);
    onChange({ ...block, starts_date_ymd: next || null });
  };

  const blockServiceComboOptions = useMemo<HubComboboxOption[]>(() => {
    const locked = anchorGroup;
    const filtered = serviceTypes.filter((st) => {
      if (st.allow_scheduling === false) return false;
      if (locked) return normalizeServiceGroupSlug(st.service_group) === locked;
      if (block.group_filter === 'all') return true;
      return normalizeServiceGroupSlug(st.service_group) === block.group_filter;
    });
    return filtered.map((st) => ({
      value: st.id,
      label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}`,
    }));
  }, [serviceTypes, block.group_filter, anchorGroup]);

  const ltServiceOptions = useMemo<HubComboboxOption[]>(
    () =>
      serviceTypes
        .filter((st) => normalizeServiceGroupSlug(st.service_group) === 'leva_traz')
        .map((st) => ({ value: st.id, label: st.name })),
    [serviceTypes],
  );

  const recurrence = block.recurrence ?? defaultBlockRecurrence();
  const pickup = block.pickup ?? defaultBlockPickup(block.starts_hm, block.ends_hm);

  const commitServices = (services: ExtraBlock['services']) => {
    onChange(
      applyExtraBlockAutoFields(
        { ...block, services },
        serviceTypes,
        petName,
        { recalcEnds: true },
      ),
    );
  };

  const addSvc = (id: string) => {
    if (!id) return;
    const gate = canAddServiceToBlock({
      existingServiceTypeIds: block.services.map((s) => s.hub_service_type_id),
      newServiceTypeId: id,
      serviceTypes,
    });
    if (!gate.ok) {
      setSvcSearchId('');
      return;
    }
    const st = serviceTypes.find((s) => s.id === id);
    if (!st) return;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    const nextGroup = normalizeServiceGroupSlug(st.service_group);
    onChange(
      applyExtraBlockAutoFields(
        {
          ...block,
          group_filter: nextGroup,
          services: [
            ...block.services,
            {
              hub_service_type_id: id,
              name: st.name,
              duration_minutes: st.default_duration_minutes ?? 60,
              pricing_variant,
            },
          ],
        },
        serviceTypes,
        petName,
        { recalcEnds: true },
      ),
    );
    setSvcSearchId('');
  };

  const removeSvc = (svcId: string) =>
    commitServices(block.services.filter((s) => s.hub_service_type_id !== svcId));

  const updateSvcDuration = (idx: number, dur: number) => {
    const services = block.services.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s));
    const durationMin = services.reduce((sum, s) => sum + s.duration_minutes, 0);
    onChange({
      ...block,
      services,
      ends_hm: durationMin > 0 ? addMinutes(block.starts_hm, durationMin) : block.ends_hm,
    });
  };

  const blockDurationMin = useMemo(
    () => block.services.reduce((sum, s) => sum + s.duration_minutes, 0),
    [block.services],
  );

  const blockCardExpansion = useServiceCardExpansion(block.services.map((s) => s.hub_service_type_id));

  const updateSvcVariant = (idx: number, variant: HubQuotePricingVariant | null) =>
    onChange({
      ...block,
      services: block.services.map((s, i) => (i === idx ? { ...s, pricing_variant: variant } : s)),
    });

  const onStartsChange = (starts_hm: string) => {
    const durationMin = block.services.reduce((sum, s) => sum + s.duration_minutes, 0);
    onChange({
      ...block,
      starts_hm,
      ends_hm: durationMin > 0 ? addMinutes(starts_hm, durationMin) : block.ends_hm,
    });
  };

  return (
    <div className="nam-section nam-block-card nam-extra-block">
      <BlockCardHeader
        blockNumber={displayBlockNumber}
        title={block.block_title.trim() || autoTitle || `Bloco ${displayBlockNumber}`}
        subtitle={headerSubtitle || undefined}
        badgeVariant="secondary"
        expanded={block.expanded}
        onToggle={onToggleExpand}
        onRemove={onRemove}
      />

      {block.expanded && (
        <div className="nam-block-card__body">
          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Grupo de serviço</label>
                <HubSearchableCombobox
                  id={`nam-eb-group-${block.key}`}
                  options={groups}
                  value={anchorGroup ?? block.group_filter}
                  onChange={(v) => {
                    if (anchorGroup && v !== anchorGroup && v !== 'all') return;
                    onChange({ ...block, group_filter: v });
                  }}
                  clearable={false}
                  placeholder="Todos os grupos"
                />
                {anchorGroup ? (
                  <p className="nam-aside__muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Grupo fixo deste bloco.
                  </p>
                ) : null}
              </div>
              <div className="nam-field">
                <label className="nam-label">Serviços</label>
                <HubSearchableCombobox
                  id={`nam-eb-svc-${block.key}`}
                  options={blockServiceComboOptions}
                  value={svcSearchId}
                  onChange={addSvc}
                  placeholder="Buscar e adicionar serviço…"
                  clearable={false}
                  markedValues={block.services.map((s) => s.hub_service_type_id)}
                />
              </div>
            </div>
            {block.services.length > 0 && (
              <div className="nam-service-cards">
                {block.services.map((chip, idx) => (
                  <AppointmentServiceCard
                    key={chip.hub_service_type_id}
                    idPrefix={`nam-eb-${block.key}`}
                    chip={chip}
                    serviceIndex={idx}
                    serviceType={serviceTypes.find((st) => st.id === chip.hub_service_type_id)}
                    expanded={blockCardExpansion.isExpanded(chip.hub_service_type_id)}
                    onToggleExpand={() => blockCardExpansion.toggle(chip.hub_service_type_id)}
                    onRemove={() => removeSvc(chip.hub_service_type_id)}
                    onDurationChange={(dur) => updateSvcDuration(idx, dur)}
                    parentAddons={[]}
                    addonsLoading={false}
                    selectedAddons={[]}
                    onAddonToggle={() => undefined}
                    onAddonVariantChange={() => undefined}
                    variantMatrix={serviceNeedsVariantMatrix(chip, serviceTypes)}
                    onVariantChange={(v) => updateSvcVariant(idx, v)}
                    pricingLine={null}
                  />
                ))}
                <div className="nam-chips__duration-breakdown">
                  Total: <strong>{blockDurationMin} min</strong>
                </div>
              </div>
            )}
          </div>

          <div className="nam-section">
            {isHotelBlock ? (
              <>
                <p className="nam-aside__muted" style={{ marginBottom: 8, fontSize: 13 }}>
                  Estadia de hotel: informe entrada e saída. Sem «Repetir» — a duração é o intervalo.
                </p>
                <div className="nam-row nam-row--cols2">
                  <div className="nam-field">
                    <HubDateField
                      id={`nam-eb-starts-date-${block.key}`}
                      label="Data de entrada"
                      valueIso={blockDateYmd}
                      onChangeIso={setBlockDate}
                      showTodayButton={false}
                    />
                  </div>
                  <div className="nam-field">
                    <HubTimeField
                      id={`nam-eb-starts-${block.key}`}
                      label="Horário de entrada"
                      valueHm={block.starts_hm}
                      onChangeHm={onStartsChange}
                    />
                  </div>
                </div>
                <div className="nam-row nam-row--cols2" style={{ marginTop: 8 }}>
                  <div className="nam-field">
                    <HubDateField
                      id={`nam-eb-checkout-date-${block.key}`}
                      label="Data de saída"
                      valueIso={block.checkout_date_ymd ?? blockDateYmd}
                      onChangeIso={(iso) => {
                        const next = clampYmd(iso || blockDateYmd, blockDateYmd || minDateYmd, maxDateYmd);
                        onChange({
                          ...block,
                          checkout_date_ymd: next || blockDateYmd,
                          checkout_hm: block.checkout_hm ?? block.ends_hm,
                        });
                      }}
                      showTodayButton={false}
                    />
                  </div>
                  <div className="nam-field">
                    <HubTimeField
                      id={`nam-eb-checkout-hm-${block.key}`}
                      label="Horário de saída"
                      valueHm={block.checkout_hm ?? block.ends_hm}
                      onChangeHm={(checkout_hm) => onChange({ ...block, checkout_hm, ends_hm: checkout_hm })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="nam-row nam-row--cols3">
                <div className="nam-field">
                  <HubDateField
                    id={`nam-eb-starts-date-${block.key}`}
                    label="Data"
                    valueIso={blockDateYmd}
                    onChangeIso={setBlockDate}
                    showTodayButton={false}
                  />
                </div>
                <div className="nam-field">
                  <HubTimeField
                    id={`nam-eb-starts-${block.key}`}
                    label="Início"
                    valueHm={block.starts_hm}
                    onChangeHm={onStartsChange}
                  />
                </div>
                <div className="nam-field">
                  <HubTimeField
                    id={`nam-eb-ends-${block.key}`}
                    label="Fim previsto"
                    valueHm={block.ends_hm}
                    onChangeHm={(ends_hm) => onChange({ ...block, ends_hm })}
                  />
                </div>
              </div>
            )}
            {isCrecheBlock ? (
              <div className="nam-field" style={{ marginTop: 8 }}>
                <label className="nam-label">Período da creche</label>
                <select
                  className="nam-select"
                  value={block.daycare_period ?? 'full_day'}
                  onChange={(e) =>
                    onChange({
                      ...block,
                      daycare_period: e.target.value as 'full_day' | 'half_day',
                    })
                  }
                >
                  <option value="full_day">Integral</option>
                  <option value="half_day">Meio período</option>
                </select>
              </div>
            ) : null}
          </div>

          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Profissional</label>
                <HubSearchableCombobox
                  id={`nam-eb-staff-${block.key}`}
                  options={staffComboOptions}
                  value={block.hub_staff_member_id}
                  onChange={(v) => onChange({ ...block, hub_staff_member_id: v })}
                  placeholder="Não atribuído"
                  clearable={false}
                />
              </div>
              <AppointmentResourceField
                id={`nam-eb-resource-${block.key}`}
                clinicId={clinicId}
                unitId={unitId}
                serviceTypeId={block.services[0]?.hub_service_type_id ?? null}
                dateYmd={blockDateYmd}
                startsHm={block.starts_hm}
                endsHm={block.ends_hm}
                excludeAppointmentId={block.appointment_id}
                value={{ hubResourceId: block.hub_resource_id ?? null, resourceLabel: block.resource_label }}
                onChange={(next) =>
                  onChange({
                    ...block,
                    hub_resource_id: next.hubResourceId,
                    resource_label: next.resourceLabel,
                  })
                }
              />
            </div>
          </div>

          <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 10 }}>
            <label className="nam-label">Título do bloco</label>
            <div className="nam-title-row">
              <input
                className="nam-input"
                type="text"
                maxLength={200}
                placeholder={autoTitle || `Bloco ${displayBlockNumber}`}
                value={block.block_title}
                onChange={(e) =>
                  onChange({
                    ...block,
                    block_title: e.target.value,
                    block_title_user_edited: true,
                  })
                }
              />
              {block.block_title_user_edited ? (
                <button
                  className="nam-btn-icon"
                  type="button"
                  title="Restaurar sugestão automática"
                  onClick={() =>
                    onChange({
                      ...block,
                      block_title: autoTitle,
                      block_title_user_edited: false,
                    })
                  }
                >
                  <RefreshCw size={14} />
                </button>
              ) : null}
            </div>
          </div>
          <div className="nam-section" style={{ borderBottom: 'none', paddingTop: 0 }}>
            <label className="nam-label">Descrição do bloco</label>
            <div className="nam-title-row" style={{ alignItems: 'flex-start' }}>
              <textarea
                className="nam-textarea"
                rows={3}
                maxLength={8000}
                placeholder="Preenchida automaticamente com as descrições dos serviços deste bloco; pode editar."
                value={block.block_description}
                onChange={(e) =>
                  onChange({
                    ...block,
                    block_description: e.target.value,
                    block_description_user_edited: true,
                  })
                }
                style={{ flex: 1 }}
              />
              {block.block_description_user_edited ? (
                <button
                  className="nam-btn-icon"
                  type="button"
                  title="Restaurar descrição automática"
                  onClick={() =>
                    onChange({
                      ...block,
                      block_description: buildServiceDescriptionBullets(
                        serviceTypes,
                        block.services.map((s) => s.hub_service_type_id),
                      ),
                      block_description_user_edited: false,
                    })
                  }
                >
                  <RefreshCw size={14} />
                </button>
              ) : null}
            </div>
            <p className="nam-char-count">{block.block_description.length}/8000</p>
          </div>

          <BlockRecurrencePickupFields
            blockKey={block.key}
            recurrence={recurrence}
            pickup={pickup}
            hideRecurrence={hideRecurrence || isHotelBlock}
            hidePickup={hidePickup}
            pickupHint={pickupHint}
            ltServiceOptions={ltServiceOptions}
            onRecurrenceChange={(next) => onChange({ ...block, recurrence: next })}
            onPickupChange={(next) => onChange({ ...block, pickup: next })}
          />
        </div>
      )}
    </div>
  );
};

export default ExtraBlockCard;
