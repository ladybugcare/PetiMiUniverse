import React, { useEffect, useMemo, useState } from 'react';
import { HubSearchableCombobox } from '../../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../../components/HubSearchableCombobox';
import { HubSidePanel } from '../../../components/HubSidePanel';
import { HubCancelButton } from '../../../components/HubCancelButton';
import { hubClinicalApi, type HubHospitalBed, type HubHospitalization } from '../../../api/hubClinicalApi';
import { useAlert } from '../../../components/AlertProvider';

type HospBedAssignPanelProps = {
  open: boolean;
  clinicId: string;
  hospitalization: HubHospitalization | null;
  beds: HubHospitalBed[];
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
};

const HospBedAssignPanel: React.FC<HospBedAssignPanelProps> = ({
  open,
  clinicId,
  hospitalization,
  beds,
  onClose,
  onAssigned,
}) => {
  const { showError, showSuccess } = useAlert();
  const currentBedId = hospitalization?.hub_hospital_bed_id ?? '';
  const [bedId, setBedId] = useState(currentBedId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setBedId(hospitalization?.hub_hospital_bed_id ?? '');
  }, [open, hospitalization?.id, hospitalization?.hub_hospital_bed_id]);

  const options: HubComboboxOption[] = useMemo(() => {
    const available = beds
      .filter((b) => b.id === currentBedId || b.status === 'available' || !b.status)
      .map((b) => ({
        value: b.id,
        label: `${b.label || b.code}${b.id === currentBedId ? ' (atual)' : ''}`,
      }));
    return [{ value: '', label: 'Sem leito' }, ...available];
  }, [beds, currentBedId]);

  const petName = hospitalization?.hub_pets?.name || 'Internação';
  const hasCurrent = Boolean(currentBedId);
  const changed = (bedId || '') !== (currentBedId || '');

  const save = async () => {
    if (!hospitalization) return;
    setSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(hospitalization.id, {
        clinic_id: clinicId,
        hub_hospital_bed_id: bedId || null,
      });
      showSuccess(bedId ? (hasCurrent ? 'Leito atualizado' : 'Leito atribuído') : 'Leito removido');
      onClose();
      await onAssigned();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar leito');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <HubSidePanel
      open={open && Boolean(hospitalization)}
      onClose={onClose}
      title={hasCurrent ? `Trocar leito — ${petName}` : `Atribuir leito — ${petName}`}
      footer={
        <div className="hub-clientes__panel-footer">
          <HubCancelButton onClick={onClose} />
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={submitting || !changed}
            onClick={() => void save()}
          >
            {submitting ? 'Salvando…' : 'Salvar leito'}
          </button>
        </div>
      }
    >
      <div className="hub-clientes__form-stack">
        <span className="hub-clientes__label">Leito</span>
        <HubSearchableCombobox
          id="hosp-assign-bed"
          className="hub-combobox--clientes"
          options={options}
          value={bedId}
          onChange={setBedId}
          placeholder="Selecionar leito…"
        />
        {options.length <= 1 ? (
          <p className="hub-clientes__muted">Nenhum leito livre. Cadastre um leito no mapa antes de atribuir.</p>
        ) : null}
      </div>
    </HubSidePanel>
  );
};

export default HospBedAssignPanel;
