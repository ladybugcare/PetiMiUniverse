import React, { useMemo } from 'react';
import { HubSearchableCombobox, HubCheckbox, type HubComboboxOption } from '@petimi/hub-ui';

export type HubTechnicalManagerFieldProps = {
  idPrefix: string;
  selfDisplayName: string;
  isSelf: boolean;
  onIsSelfChange: (value: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  staffOptions?: HubComboboxOption[];
  disabled?: boolean;
};

const HubTechnicalManagerField: React.FC<HubTechnicalManagerFieldProps> = ({
  idPrefix,
  selfDisplayName,
  isSelf,
  onIsSelfChange,
  name,
  onNameChange,
  staffOptions = [],
  disabled = false,
}) => {
  const comboboxOptions = useMemo((): HubComboboxOption[] => {
    const rows = [...staffOptions];
    const trimmed = name.trim();
    if (trimmed && !rows.some((r) => r.value === trimmed)) {
      rows.push({ value: trimmed, label: trimmed });
    }
    return rows;
  }, [staffOptions, name]);

  return (
    <div className="hub-onboarding-field hub-onboarding-field--full">
      <HubCheckbox
        id={`${idPrefix}-rt-self`}
        className="hub-onboarding-toggle-row"
        checked={isSelf}
        disabled={disabled}
        onChange={onIsSelfChange}
      >
        Eu sou o responsável técnico
      </HubCheckbox>
      {isSelf ? (
        <p className="hub-clientes__subtitle" style={{ margin: '8px 0 0' }}>
          Será registado como: <strong>{selfDisplayName.trim() || '—'}</strong>
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="hub-clientes__label" htmlFor={`${idPrefix}-rt-name`}>
            Responsável técnico
          </label>
          <HubSearchableCombobox
            id={`${idPrefix}-rt-name`}
            className="hub-combobox--clientes"
            options={comboboxOptions}
            value={name}
            onChange={onNameChange}
            placeholder="Nome ou selecionar da equipe"
            searchPlaceholder="Buscar ou digitar nome…"
            allowCreate
            createEntityLabel="responsável técnico"
            disabled={disabled}
            ariaLabel="Responsável técnico da unidade"
          />
        </div>
      )}
    </div>
  );
};

export default HubTechnicalManagerField;
