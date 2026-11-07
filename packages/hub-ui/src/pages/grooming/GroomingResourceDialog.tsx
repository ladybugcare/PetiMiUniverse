import React, { useState } from 'react';
import type { ResourceAvailability } from '../../api/hubResourcesApi';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import './grooming-resource-dialog.css';

export type GroomingResourceChoice = {
  hubResourceId: string | null;
  skipResource: boolean;
};

type GroomingResourceDialogProps = {
  availability: ResourceAvailability;
  busyName: string | null;
  onConfirm: (choice: GroomingResourceChoice) => void;
  onCancel: () => void;
};

export const GroomingResourceDialog: React.FC<GroomingResourceDialogProps> = ({
  availability,
  busyName,
  onConfirm,
  onCancel,
}) => {
  const free = availability.resources.filter((r) => !r.busy);
  const busy = availability.resources.filter((r) => r.busy);
  const [selected, setSelected] = useState(free[0]?.id ?? '');
  const required = availability.policy === 'required_on_start';
  const label = availability.field_label;
  const noun = label.toLowerCase();
  const allBusy = free.length === 0 && availability.resources.length > 0;

  const options: HubComboboxOption[] = free.map((r) => ({
    value: r.id,
    label: r.kind_name ? `${r.kind_name} · ${r.name}` : r.name,
  }));

  const skip = () => onConfirm({ hubResourceId: null, skipResource: true });

  return (
    <div
      className="grooming-resource-dialog"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="grooming-resource-dialog__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grooming-resource-title"
      >
        <h2 id="grooming-resource-title">Escolher {noun}</h2>
        {allBusy ? (
          required ? (
            <p className="grooming-resource-dialog__warn">
              Todas as opções de {noun} estão em uso. Marque um pet como pronto para liberar uma.
            </p>
          ) : (
            <p className="grooming-resource-dialog__warn">
              Todas as opções de {noun} estão em uso. Você pode iniciar este pet mesmo assim, sem alocar.
            </p>
          )
        ) : busyName ? (
          <p className="grooming-resource-dialog__warn">
            {label} «{busyName}» ainda está em uso. Escolha outra livre.
          </p>
        ) : required ? (
          <p>Escolha {noun} livre para iniciar o atendimento.</p>
        ) : (
          <p>Escolha onde o atendimento vai ser feito, ou siga sem alocar.</p>
        )}
        {free.length === 0 ? (
          allBusy ? null : <p>Não há {noun} livre neste momento.</p>
        ) : (
          <div className="grooming-resource-dialog__field">
            <label htmlFor="grooming-resource-select">{label}</label>
            <HubSearchableCombobox
              id="grooming-resource-select"
              className="hub-combobox--clientes"
              options={options}
              value={selected}
              onChange={setSelected}
              placeholder={`Selecione ${noun}…`}
              searchPlaceholder={`Buscar ${noun}…`}
              ariaLabel={`Selecionar ${noun}`}
            />
            {busy.length > 0 ? (
              <span className="grooming-resource-dialog__hint">
                Em uso: {busy.map((r) => r.name).join(', ')}
              </span>
            ) : null}
          </div>
        )}
        <div className="grooming-resource-dialog__actions">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={onCancel}>
            Voltar
          </button>
          {!required && free.length === 0 ? (
            <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={skip}>
              Iniciar sem alocar
            </button>
          ) : (
            <>
              {!required ? (
                <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={skip}>
                  Seguir sem alocar
                </button>
              ) : null}
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={!selected}
                onClick={() => onConfirm({ hubResourceId: selected, skipResource: false })}
              >
                Iniciar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
