import React, { useState } from 'react';
import type { ResourceAvailability } from '../../api/hubResourcesApi';
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
  const suggested = free[0]?.id ?? '';
  const [selected, setSelected] = useState(suggested);
  const required = availability.policy === 'required_on_start';
  const label = availability.field_label;

  return (
    <div className="grooming-resource-dialog" role="presentation">
      <div className="grooming-resource-dialog__card" role="dialog" aria-modal="true" aria-labelledby="grooming-resource-title">
        <h2 id="grooming-resource-title">Escolher {label.toLowerCase()}</h2>
        {busyName ? (
          <p className="grooming-resource-dialog__warn">
            {label} «{busyName}» ainda está em uso. Escolha outra livre.
          </p>
        ) : required ? (
          <p>Escolha {label.toLowerCase()} livre para iniciar o atendimento.</p>
        ) : (
          <p>Escolha onde o atendimento vai ser feito, ou siga sem alocar.</p>
        )}
        {free.length === 0 ? (
          <p>Não há {label.toLowerCase()} livre neste momento.</p>
        ) : (
          <label className="grooming-resource-dialog__field">
            <span>{label}</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {!required ? <option value="">Definir sem alocar</option> : null}
              {availability.resources.map((r) => (
                <option key={r.id} value={r.id} disabled={r.busy}>
                  {r.kind_name !== label ? `${r.kind_name} · ` : ''}
                  {r.name}
                  {r.busy ? ' (em uso)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grooming-resource-dialog__actions">
          <button type="button" className="grooming-resource-dialog__ghost" onClick={onCancel}>
            Voltar
          </button>
          {!required ? (
            <button type="button" className="grooming-resource-dialog__ghost" onClick={() => onConfirm({ hubResourceId: null, skipResource: true })}>
              Seguir sem alocar
            </button>
          ) : null}
          <button
            type="button"
            className="grooming-resource-dialog__primary"
            disabled={required && !selected}
            onClick={() => {
              if (!selected) {
                onConfirm({ hubResourceId: null, skipResource: true });
                return;
              }
              onConfirm({ hubResourceId: selected, skipResource: false });
            }}
          >
            Iniciar
          </button>
        </div>
      </div>
    </div>
  );
};
