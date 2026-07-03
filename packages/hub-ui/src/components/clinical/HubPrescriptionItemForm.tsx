import React from 'react';
import type { HubInventoryItem } from '../../api/hubInventoryApi';
import type { HubPrescriptionAdministration } from '../../api/hubClinicalApi';

export type PrescriptionItemDraft = {
  medication_name: string;
  presentation: string;
  concentration: string;
  quantity: string;
  posology: string;
  duration: string;
  instructions: string;
  hub_inventory_item_id: string;
  administration: HubPrescriptionAdministration;
};

export const emptyPrescriptionItemDraft = (): PrescriptionItemDraft => ({
  medication_name: '',
  presentation: '',
  concentration: '',
  quantity: '',
  posology: '',
  duration: '',
  instructions: '',
  hub_inventory_item_id: '',
  administration: 'home_use',
});

type Props = {
  draft: PrescriptionItemDraft;
  onChange: (next: PrescriptionItemDraft) => void;
  onAdd: () => void;
  medicationItems: HubInventoryItem[];
  disabled?: boolean;
};

export function HubPrescriptionItemForm({ draft, onChange, onAdd, medicationItems, disabled }: Props) {
  const set = (patch: Partial<PrescriptionItemDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="hub-cws-rx-form hub-rx-item-form">
      <input
        className="hub-clientes__input"
        placeholder="Medicamento *"
        value={draft.medication_name}
        disabled={disabled}
        onChange={(e) => set({ medication_name: e.target.value })}
      />
      <input
        className="hub-clientes__input"
        placeholder="Apresentação"
        value={draft.presentation}
        disabled={disabled}
        onChange={(e) => set({ presentation: e.target.value })}
      />
      <input
        className="hub-clientes__input"
        placeholder="Concentração"
        value={draft.concentration}
        disabled={disabled}
        onChange={(e) => set({ concentration: e.target.value })}
      />
      <input
        className="hub-clientes__input"
        placeholder="Quantidade"
        value={draft.quantity}
        disabled={disabled}
        onChange={(e) => set({ quantity: e.target.value })}
      />
      <input
        className="hub-clientes__input"
        placeholder="Posologia"
        value={draft.posology}
        disabled={disabled}
        onChange={(e) => set({ posology: e.target.value })}
      />
      <input
        className="hub-clientes__input"
        placeholder="Duração"
        value={draft.duration}
        disabled={disabled}
        onChange={(e) => set({ duration: e.target.value })}
      />
      <textarea
        className="hub-clientes__input"
        rows={2}
        placeholder="Observações do item"
        value={draft.instructions}
        disabled={disabled}
        onChange={(e) => set({ instructions: e.target.value })}
      />
      <select
        className="hub-clientes__input"
        value={draft.administration}
        disabled={disabled}
        onChange={(e) => set({ administration: e.target.value as HubPrescriptionAdministration })}
      >
        <option value="home_use">Uso em casa (retirada / posologia domiciliar)</option>
        <option value="administered_in_clinic">Administrado na clínica</option>
      </select>
      {medicationItems.length > 0 ? (
        <select
          className="hub-clientes__input"
          value={draft.hub_inventory_item_id}
          disabled={disabled}
          onChange={(e) => set({ hub_inventory_item_id: e.target.value })}
        >
          <option value="">Item de estoque (opcional)</option>
          {medicationItems.map((it) => (
            <option key={it.id} value={it.id}>
              {it.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
        disabled={disabled || !draft.medication_name.trim()}
        onClick={onAdd}
      >
        Adicionar à prescrição
      </button>
    </div>
  );
}
