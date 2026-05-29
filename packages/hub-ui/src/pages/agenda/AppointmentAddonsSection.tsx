import React from 'react';
import { Loader2 } from 'lucide-react';
import type { HubServiceType } from '../../api/hubServiceTypesApi';
import type { HubQuotePricingVariant } from '../../api/hubQuotesApi';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubCheckbox } from '../../components/HubCheckbox';
import {
  comboValueToVariant,
  variantComboboxOptionsForMatrix,
  variantToComboValue,
} from '../../utils/hubPricingVariantUi';
import {
  addonMetaLabel,
  addonNeedsVariantOnRow,
  type AppointmentServiceChip,
} from './appointmentAddonsUtils';

export type AppointmentAddonsSectionProps = {
  hasMainServices: boolean;
  addonsLoading: boolean;
  availableAddons: HubServiceType[];
  selectedAddons: AppointmentServiceChip[];
  onToggle: (addon: HubServiceType) => void;
  onVariantChange: (addonId: string, variant: HubQuotePricingVariant | null) => void;
};

const AppointmentAddonsSection: React.FC<AppointmentAddonsSectionProps> = ({
  hasMainServices,
  addonsLoading,
  availableAddons,
  selectedAddons,
  onToggle,
  onVariantChange,
}) => {
  if (!hasMainServices) return null;

  return (
    <div className="nam-addon-section">
      <p className="nam-label">Adicionais</p>
      <p className="nam-addon-section__hint nam-muted">
        Opcionais do grupo. Só aparecem os adicionais disponíveis para os serviços seleccionados.
      </p>

      {addonsLoading ? (
        <p className="nam-addon-section__loading">
          <Loader2 size={16} className="nam-addon-section__spinner" aria-hidden />
          Carregando adicionais…
        </p>
      ) : availableAddons.length === 0 ? (
        <p className="nam-muted nam-addon-section__empty">
          Nenhum adicional disponível para estes serviços. Configure em Serviços → Adicionais ou na
          disponibilidade do serviço.
        </p>
      ) : (
        <div className="nam-addon-card">
          <ul className="nam-addon-list">
            {availableAddons.map((addon) => {
              const chip = selectedAddons.find((s) => s.hub_service_type_id === addon.id);
              const checked = Boolean(chip);
              const variantRow = checked ? addonNeedsVariantOnRow(addon, chip) : null;
              const meta = addonMetaLabel(addon);

              return (
                <li key={addon.id} className="nam-addon-row">
                  <HubCheckbox
                    className="nam-addon-row__check"
                    checked={checked}
                    onChange={() => onToggle(addon)}
                  >
                    <span className="nam-addon-row__name">{addon.name}</span>
                    {meta ? <span className="nam-addon-row__meta">{meta}</span> : null}
                  </HubCheckbox>
                  {variantRow ? (
                    <div className="nam-addon-row__variant">
                      <HubSearchableCombobox
                        id={`nam-addon-variant-${addon.id}`}
                        options={variantComboboxOptionsForMatrix(variantRow.matrix)}
                        value={variantToComboValue(variantRow.matrix, chip?.pricing_variant ?? null)}
                        onChange={(raw) => {
                          const v = comboValueToVariant(variantRow.matrix, raw);
                          onVariantChange(addon.id, v);
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
        </div>
      )}
    </div>
  );
};

export default AppointmentAddonsSection;
