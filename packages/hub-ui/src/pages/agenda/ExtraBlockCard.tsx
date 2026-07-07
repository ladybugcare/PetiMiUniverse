import React, { useMemo, useState } from 'react';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import {
  defaultPricingVariantForMatrix,
  matrixNeedsVariantChoice,
} from '../../utils/hubPricingVariantUi';
import { coercePricingMatrixFromApi } from '../../utils/hubServiceTypesPricingMatrix';
import { normalizeServiceGroupSlug } from '../../utils/serviceTypeSlug';
import {
  AppointmentServiceCard,
  serviceNeedsVariantMatrix,
  useServiceCardExpansion,
} from './AppointmentServiceCard';
import { BlockCardHeader } from './BlockCardHeader';
import type { ExtraBlock } from './appointmentSchedulingUtils';

export type ExtraBlockCardProps = {
  block: ExtraBlock;
  index: number;
  blockNumber?: number;
  groups: HubComboboxOption[];
  staffComboOptions: HubComboboxOption[];
  serviceTypes: HubServiceType[];
  onRemove: () => void;
  onChange: (updated: ExtraBlock) => void;
  onToggleExpand: () => void;
};

export const ExtraBlockCard: React.FC<ExtraBlockCardProps> = ({
  block,
  index,
  blockNumber,
  groups,
  staffComboOptions,
  serviceTypes,
  onRemove,
  onChange,
  onToggleExpand,
}) => {
  const [svcSearchId, setSvcSearchId] = useState('');
  const displayBlockNumber = blockNumber ?? index + 2;

  const blockServiceComboOptions = useMemo<HubComboboxOption[]>(() => {
    const filtered = serviceTypes.filter(
      (st) =>
        st.allow_scheduling !== false &&
        (block.group_filter === 'all' || normalizeServiceGroupSlug(st.service_group) === block.group_filter),
    );
    return filtered.map((st) => ({
      value: st.id,
      label: `${st.name}${st.default_duration_minutes ? ` (${st.default_duration_minutes}min)` : ''}`,
    }));
  }, [serviceTypes, block.group_filter]);

  const addSvc = (id: string) => {
    if (!id) return;
    if (block.services.some((s) => s.hub_service_type_id === id)) {
      setSvcSearchId('');
      return;
    }
    const st = serviceTypes.find((s) => s.id === id);
    if (!st) return;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    onChange({
      ...block,
      services: [
        ...block.services,
        {
          hub_service_type_id: id,
          name: st.name,
          duration_minutes: st.default_duration_minutes ?? 60,
          pricing_variant,
        },
      ],
    });
    setSvcSearchId('');
  };

  const removeSvc = (svcId: string) =>
    onChange({ ...block, services: block.services.filter((s) => s.hub_service_type_id !== svcId) });

  const updateSvcDuration = (idx: number, dur: number) =>
    onChange({
      ...block,
      services: block.services.map((s, i) => (i === idx ? { ...s, duration_minutes: dur } : s)),
    });

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

  return (
    <div className="nam-section nam-block-card nam-extra-block">
      <BlockCardHeader
        blockNumber={displayBlockNumber}
        title={block.block_title.trim() || `Bloco ${displayBlockNumber}`}
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
                  value={block.group_filter}
                  onChange={(v) => onChange({ ...block, group_filter: v })}
                  clearable={false}
                  placeholder="Todos os grupos"
                />
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
            <label className="nam-label">Título do bloco</label>
            <div className="nam-title-row">
              <input
                className="nam-input"
                type="text"
                maxLength={200}
                placeholder={`Bloco ${displayBlockNumber}`}
                value={block.block_title}
                onChange={(e) => onChange({ ...block, block_title: e.target.value })}
              />
            </div>
          </div>

          <div className="nam-section">
            <label className="nam-label">Descrição do bloco</label>
            <textarea
              className="nam-textarea"
              rows={3}
              maxLength={8000}
              placeholder="Preenchida automaticamente com as descrições dos serviços deste bloco; pode editar."
              value={block.block_description}
              onChange={(e) =>
                onChange({ ...block, block_description: e.target.value, block_description_user_edited: true })
              }
            />
            <p className="nam-char-count">{block.block_description.length}/8000</p>
          </div>

          <div className="nam-section">
            <div className="nam-row nam-row--cols2">
              <div className="nam-field">
                <label className="nam-label">Início</label>
                <input
                  className="nam-input"
                  type="time"
                  value={block.starts_hm}
                  onChange={(e) => onChange({ ...block, starts_hm: e.target.value })}
                />
              </div>
              <div className="nam-field">
                <label className="nam-label">Fim previsto</label>
                <input
                  className="nam-input"
                  type="time"
                  value={block.ends_hm}
                  onChange={(e) => onChange({ ...block, ends_hm: e.target.value })}
                />
              </div>
            </div>
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
              <div className="nam-field">
                <label className="nam-label">Recurso / Sala</label>
                <input
                  className="nam-input"
                  type="text"
                  placeholder="Ex.: Mesa 1, Van…"
                  value={block.resource_label}
                  onChange={(e) => onChange({ ...block, resource_label: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtraBlockCard;
