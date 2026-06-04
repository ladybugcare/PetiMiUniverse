import React, { useMemo } from 'react';
import type { HubGuardian } from '../../../../api/hubGuardiansApi';
import { HubSearchableCombobox } from '../../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../../components/HubSearchableCombobox';
import type { PetWizardState } from '../types';

type Props = {
  state: PetWizardState;
  update: (p: Partial<PetWizardState>) => void;
  guardians: HubGuardian[];
};

export const PetWizardStepGuardians: React.FC<Props> = ({ state, update, guardians }) => {
  const primaryOptions = useMemo((): HubComboboxOption[] => {
    return guardians.map((g) => ({ value: g.id, label: g.full_name }));
  }, [guardians]);

  const secondaryOptions = useMemo((): HubComboboxOption[] => {
    return guardians
      .filter((g) => g.id !== state.primary_guardian_id)
      .map((g) => ({ value: g.id, label: g.full_name }));
  }, [guardians, state.primary_guardian_id]);

  return (
    <div className="pet-wizard__step-pane">
      <h3 className="pet-wizard__section-title">Responsáveis</h3>
      <div className="pet-wizard__fields">
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label" htmlFor="pet-wizard-primary-guardian">
            Tutor principal <span className="req">*</span>
          </label>
          <HubSearchableCombobox
            id="pet-wizard-primary-guardian"
            className="pet-wizard__combobox"
            options={primaryOptions}
            value={state.primary_guardian_id}
            onChange={(v) => update({ primary_guardian_id: v })}
            placeholder="— Selecionar —"
            searchPlaceholder="Buscar tutor…"
            allowCreate={false}
            clearable={false}
            ariaLabel="Tutor principal"
          />
        </div>
        <div className="pet-wizard__field--full">
          <label className="pet-wizard__label" htmlFor="pet-wizard-secondary-guardian">
            Tutor secundário (opcional)
          </label>
          <HubSearchableCombobox
            id="pet-wizard-secondary-guardian"
            className="pet-wizard__combobox"
            options={secondaryOptions}
            value={state.secondary_guardian_id}
            onChange={(v) => update({ secondary_guardian_id: v })}
            placeholder="— Nenhum —"
            searchPlaceholder="Buscar tutor…"
            allowCreate={false}
            ariaLabel="Tutor secundário"
          />
        </div>
      </div>
    </div>
  );
};
