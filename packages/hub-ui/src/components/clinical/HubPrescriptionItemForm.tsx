import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  type HubPrescriptionAdministration,
  type HubPrescriptionLookupKind,
  type HubPrescriptionLookupOption,
} from '../../api/hubClinicalApi';
import { HubSearchableCombobox } from '../HubSearchableCombobox';
import type { HubComboboxOption } from '../HubSearchableCombobox';
import { useAlert } from '../AlertProvider';

export type PrescriptionItemDraft = {
  medication_name: string;
  presentation: string;
  concentration: string;
  quantity: string;
  posology: string;
  duration: string;
  instructions: string;
  administration: HubPrescriptionAdministration;
  use_route: string;
};

export const emptyPrescriptionItemDraft = (): PrescriptionItemDraft => ({
  medication_name: '',
  presentation: '',
  concentration: '',
  quantity: '',
  posology: '',
  duration: '',
  instructions: '',
  administration: 'home_use',
  use_route: '',
});

export function prescriptionItemToDraft(it: {
  medication_name: string;
  presentation?: string | null;
  concentration?: string | null;
  dosage?: string | null;
  quantity?: string | null;
  posology?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
  administration?: string | null;
  use_route?: string | null;
}): PrescriptionItemDraft {
  return {
    medication_name: it.medication_name ?? '',
    presentation: it.presentation ?? '',
    concentration: it.concentration ?? it.dosage ?? '',
    quantity: it.quantity ?? '',
    posology: it.posology ?? it.frequency ?? '',
    duration: it.duration ?? '',
    instructions: it.instructions ?? '',
    administration: it.administration === 'administered_in_clinic' ? 'administered_in_clinic' : 'home_use',
    use_route: it.use_route ?? '',
  };
}

type Props = {
  draft: PrescriptionItemDraft;
  onChange: (next: PrescriptionItemDraft) => void;
  onAdd: () => void;
  clinicId: string;
  disabled?: boolean;
  /** Permite criar opções no catálogo (requer hub.clinic.write). */
  canCreateLookups?: boolean;
  /** Layout mais denso (ex.: receita avulsa). */
  compact?: boolean;
  /** Rótulos acima dos campos (estilo orçamento). */
  labeled?: boolean;
  /** Modo edição de item já listado. */
  editing?: boolean;
  onCancelEdit?: () => void;
};

function toComboboxOptions(
  rows: HubPrescriptionLookupOption[],
  current: string,
): HubComboboxOption[] {
  const sorted = [...rows].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const opts: HubComboboxOption[] = sorted.map((r) => ({ value: r.label, label: r.label }));
  const cur = current.trim();
  if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
    opts.push({ value: current, label: `${cur} (valor atual)` });
  }
  return opts;
}

export function HubPrescriptionItemForm({
  draft,
  onChange,
  onAdd,
  clinicId,
  disabled,
  canCreateLookups = false,
  compact,
  labeled = false,
  editing = false,
  onCancelEdit,
}: Props) {
  const { showError, showSuccess } = useAlert();
  const [medicationLookups, setMedicationLookups] = useState<HubPrescriptionLookupOption[]>([]);
  const [presentationLookups, setPresentationLookups] = useState<HubPrescriptionLookupOption[]>([]);
  const [useRouteLookups, setUseRouteLookups] = useState<HubPrescriptionLookupOption[]>([]);

  const set = (patch: Partial<PrescriptionItemDraft>) => onChange({ ...draft, ...patch });

  const loadKind = useCallback(
    async (kind: HubPrescriptionLookupKind) => {
      if (!clinicId) return;
      try {
        const res = await hubClinicalApi.listPrescriptionLookups(clinicId, kind);
        const rows = res.lookups ?? [];
        if (kind === 'medication') setMedicationLookups(rows);
        if (kind === 'presentation') setPresentationLookups(rows);
        if (kind === 'use_route') setUseRouteLookups(rows);
      } catch {
        if (kind === 'medication') setMedicationLookups([]);
        if (kind === 'presentation') setPresentationLookups([]);
        if (kind === 'use_route') setUseRouteLookups([]);
      }
    },
    [clinicId],
  );

  useEffect(() => {
    void loadKind('medication');
    void loadKind('presentation');
    void loadKind('use_route');
  }, [loadKind]);

  const medicationOptions = useMemo(
    () => toComboboxOptions(medicationLookups, draft.medication_name),
    [medicationLookups, draft.medication_name],
  );
  const presentationOptions = useMemo(
    () => toComboboxOptions(presentationLookups, draft.presentation),
    [presentationLookups, draft.presentation],
  );
  const useRouteOptions = useMemo(
    () => toComboboxOptions(useRouteLookups, draft.use_route),
    [useRouteLookups, draft.use_route],
  );

  const handleLookupChange = useCallback(
    async (kind: HubPrescriptionLookupKind, field: 'medication_name' | 'presentation' | 'use_route', raw: string) => {
      const t = raw.trim();
      if (!t) {
        onChange({ ...draft, [field]: '' });
        return;
      }

      const existing =
        kind === 'medication'
          ? medicationLookups
          : kind === 'presentation'
            ? presentationLookups
            : useRouteLookups;
      const match = existing.find((o) => o.label.trim().toLowerCase() === t.toLowerCase());
      if (match) {
        onChange({ ...draft, [field]: match.label });
        // Persiste seed na primeira seleção para entrar no catálogo da clínica.
        if (!match.from_catalog && canCreateLookups && !disabled) {
          void hubClinicalApi
            .createPrescriptionLookup({ clinic_id: clinicId, kind, label: match.label })
            .then(() => loadKind(kind))
            .catch(() => undefined);
        }
        return;
      }

      if (!canCreateLookups || disabled) {
        onChange({ ...draft, [field]: t });
        return;
      }

      try {
        const res = await hubClinicalApi.createPrescriptionLookup({
          clinic_id: clinicId,
          kind,
          label: t,
        });
        const label = res.lookup.label;
        await loadKind(kind);
        onChange({ ...draft, [field]: label });
        if (res.created) {
          const noun =
            kind === 'medication' ? 'Medicamento' : kind === 'presentation' ? 'Apresentação' : 'Uso';
          showSuccess(`${noun} adicionado ao catálogo`);
        }
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao adicionar ao catálogo');
        onChange({ ...draft, [field]: t });
      }
    },
    [
      canCreateLookups,
      clinicId,
      disabled,
      draft,
      loadKind,
      medicationLookups,
      onChange,
      presentationLookups,
      showError,
      showSuccess,
      useRouteLookups,
    ],
  );

  const field = (label: string, htmlFor: string | undefined, node: React.ReactNode, wide?: boolean) => {
    if (!labeled) return node;
    return (
      <div className={`hub-rx-item-form__field${wide ? ' hub-rx-item-form__field--wide' : ''}`}>
        <label className="hub-rx-item-form__label" htmlFor={htmlFor}>
          {label}
        </label>
        {node}
      </div>
    );
  };

  return (
    <div
      className={`hub-cws-rx-form hub-rx-item-form${compact ? ' hub-rx-item-form--compact' : ''}${labeled ? ' hub-rx-item-form--labeled' : ''}`}
    >
      {field(
        'Medicamento *',
        'hub-rx-medication',
        <div className="hub-rx-item-form__combo">
          <HubSearchableCombobox
            id="hub-rx-medication"
            options={medicationOptions}
            value={draft.medication_name}
            onChange={(v) => void handleLookupChange('medication', 'medication_name', v)}
            placeholder={labeled ? 'Selecionar ou adicionar…' : 'Medicamento *'}
            searchPlaceholder="Buscar medicamento…"
            disabled={disabled}
            allowCreate={canCreateLookups && !disabled}
            createEntityLabel="medicamento"
            createEntityGender="m"
            ariaLabel="Medicamento"
            clearable
          />
        </div>,
      )}
      {field(
        'Apresentação',
        'hub-rx-presentation',
        <div className="hub-rx-item-form__combo">
          <HubSearchableCombobox
            id="hub-rx-presentation"
            options={presentationOptions}
            value={draft.presentation}
            onChange={(v) => void handleLookupChange('presentation', 'presentation', v)}
            placeholder={labeled ? 'Selecionar…' : 'Apresentação'}
            searchPlaceholder="Buscar apresentação…"
            disabled={disabled}
            allowCreate={canCreateLookups && !disabled}
            createEntityLabel="apresentação"
            ariaLabel="Apresentação"
            clearable
          />
        </div>,
      )}
      {field(
        'Uso',
        'hub-rx-use-route',
        <div className="hub-rx-item-form__combo">
          <HubSearchableCombobox
            id="hub-rx-use-route"
            options={useRouteOptions}
            value={draft.use_route}
            onChange={(v) => void handleLookupChange('use_route', 'use_route', v)}
            placeholder={labeled ? 'Selecionar…' : 'Uso'}
            searchPlaceholder="Buscar via de uso…"
            disabled={disabled}
            allowCreate={canCreateLookups && !disabled}
            createEntityLabel="via de uso"
            ariaLabel="Uso"
            clearable
          />
        </div>,
      )}
      {field(
        'Concentração',
        'hub-rx-concentration',
        <input
          id="hub-rx-concentration"
          className="hub-clientes__input"
          placeholder={labeled ? 'Ex.: 500mg' : 'Concentração'}
          value={draft.concentration}
          disabled={disabled}
          onChange={(e) => set({ concentration: e.target.value })}
        />,
      )}
      {field(
        'Quantidade',
        'hub-rx-quantity',
        <input
          id="hub-rx-quantity"
          className="hub-clientes__input"
          placeholder={labeled ? 'Ex.: 14 comprimidos' : 'Quantidade'}
          value={draft.quantity}
          disabled={disabled}
          onChange={(e) => set({ quantity: e.target.value })}
        />,
      )}
      {field(
        'Posologia',
        'hub-rx-posology',
        <input
          id="hub-rx-posology"
          className="hub-clientes__input"
          placeholder={labeled ? 'Ex.: 12/12h' : 'Posologia'}
          value={draft.posology}
          disabled={disabled}
          onChange={(e) => set({ posology: e.target.value })}
        />,
      )}
      {field(
        'Duração',
        'hub-rx-duration',
        <input
          id="hub-rx-duration"
          className="hub-clientes__input"
          placeholder={labeled ? 'Ex.: 7 dias' : 'Duração'}
          value={draft.duration}
          disabled={disabled}
          onChange={(e) => set({ duration: e.target.value })}
        />,
      )}
      {field(
        'Observações do item',
        'hub-rx-instructions',
        <textarea
          id="hub-rx-instructions"
          className="hub-clientes__input"
          rows={compact ? 1 : 2}
          placeholder={labeled ? 'Opcional' : 'Observações do item'}
          value={draft.instructions}
          disabled={disabled}
          onChange={(e) => set({ instructions: e.target.value })}
        />,
        true,
      )}
      {field(
        'Local de administração',
        'hub-rx-administration',
        <select
          id="hub-rx-administration"
          className="hub-clientes__input"
          value={draft.administration}
          disabled={disabled}
          onChange={(e) => set({ administration: e.target.value as HubPrescriptionAdministration })}
          aria-label="Local de administração"
        >
          <option value="home_use">Uso em casa (retirada / posologia domiciliar)</option>
          <option value="administered_in_clinic">Administrado na clínica</option>
        </select>,
        true,
      )}
      <div className="hub-rx-item-form__actions">
        {editing && onCancelEdit ? (
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
            disabled={disabled}
            onClick={onCancelEdit}
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
          disabled={disabled || !draft.medication_name.trim()}
          onClick={onAdd}
        >
          {editing ? 'Salvar alterações' : 'Adicionar à prescrição'}
        </button>
      </div>
    </div>
  );
}
