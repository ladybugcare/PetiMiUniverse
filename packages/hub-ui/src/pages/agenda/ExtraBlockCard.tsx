import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubTimeField } from '../../components/HubTimeField';
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
import {
  addMinutes,
  applyExtraBlockAutoFields,
  buildBlockHeaderSubtitle,
  buildBlockTitleFromServices,
  buildServiceDescriptionBullets,
  type ExtraBlock,
} from './appointmentSchedulingUtils';

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
};

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
}) => {
  const [svcSearchId, setSvcSearchId] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    if (block.services.some((s) => s.hub_service_type_id === id)) {
      setSvcSearchId('');
      return;
    }
    const st = serviceTypes.find((s) => s.id === id);
    if (!st) return;
    const matrix = coercePricingMatrixFromApi(st.pricing_matrix);
    const pricing_variant =
      matrix && matrixNeedsVariantChoice(matrix) ? defaultPricingVariantForMatrix(matrix) : null;
    commitServices([
      ...block.services,
      {
        hub_service_type_id: id,
        name: st.name,
        duration_minutes: st.default_duration_minutes ?? 60,
        pricing_variant,
      },
    ]);
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
            <div className="nam-row nam-row--cols2">
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

          <div className="nam-section nam-block-details">
            <button
              type="button"
              className="nam-block-details__toggle"
              onClick={() => setDetailsOpen((o) => !o)}
              aria-expanded={detailsOpen}
            >
              <span>Detalhes do bloco</span>
              {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {detailsOpen ? (
              <div className="nam-block-details__body">
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
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtraBlockCard;
