import React, { useEffect, useState } from 'react';
import { hubClinicalApi, type HubEncounter, type HubVaccination } from '../../api/hubClinicalApi';
import { useAlert } from '../AlertProvider';
import {
  emptyVaccinationFormDraft,
  HubVaccinationForm,
  type VaccinationFormDraft,
} from './HubVaccinationForm';
import { todayYmd } from '../../pages/clinica/clinicalDisplay';

function formatMoneyBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'external') return 'Externa';
  return 'Na clínica';
}

export function HubWorkspaceVaccinations({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
}) {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubVaccination[]>([]);
  const [draft, setDraft] = useState<VaccinationFormDraft>(emptyVaccinationFormDraft);
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    hubClinicalApi.listVaccinations(clinicId, encounter.pet_id ?? undefined).then((r) => {
      setItems(r.vaccinations ?? []);
    });

  useEffect(() => {
    void reload();
  }, [clinicId, encounter.pet_id]);

  const add = async () => {
    if (readOnly || submitting) return;
    const inClinic = draft.source === 'in_clinic';
    if (inClinic && (!draft.hub_inventory_item_id || !draft.hub_inventory_lot_id)) {
      showError('Selecione a vacina e o lote do estoque.');
      return;
    }
    if (!draft.vaccine_name.trim()) {
      showError('Informe o nome da vacina.');
      return;
    }
    setSubmitting(true);
    try {
      await hubClinicalApi.createVaccination({
        clinic_id: clinicId,
        pet_id: encounter.pet_id ?? '',
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        hub_staff_member_id: encounter.hub_staff_member_id ?? undefined,
        vaccine_name: draft.vaccine_name.trim(),
        batch_number: draft.batch_number.trim() || undefined,
        administered_at: todayYmd(),
        next_dose_at: draft.next_dose_at.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        source: draft.source,
        hub_inventory_item_id: inClinic ? draft.hub_inventory_item_id : undefined,
        hub_inventory_lot_id: inClinic ? draft.hub_inventory_lot_id : undefined,
      });
      setDraft(emptyVaccinationFormDraft());
      await reload();
      showSuccess(inClinic ? 'Vacina registrada e estoque atualizado.' : 'Vacina externa registrada.');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar vacina');
    } finally {
      setSubmitting(false);
    }
  };

  const vacRows = items.filter(
    (v) =>
      v.hub_encounter_id === encounter.id || (!!encounter.hub_case_id && v.hub_case_id === encounter.hub_case_id),
  );

  return (
    <>
      {!readOnly ? (
        <HubVaccinationForm
          clinicId={clinicId}
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void add()}
          disabled={readOnly}
          submitting={submitting}
        />
      ) : null}
      {vacRows.length === 0 ? (
        <p className="hub-clientes__muted" style={{ marginBottom: 0 }}>
          Nenhuma vacina registrada neste atendimento ou caso.
        </p>
      ) : (
        <div className="hub-cws-vaccine-table-wrap">
          <table className="hub-cws-vaccine-table">
            <thead>
              <tr>
                <th>Vacina</th>
                <th>Lote</th>
                <th>Origem</th>
                <th>Preço</th>
                <th>Próxima dose</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {vacRows.map((v) => (
                <tr key={v.id}>
                  <td>{v.vaccine_name}</td>
                  <td>{v.batch_number ?? '—'}</td>
                  <td>{sourceLabel(v.source)}</td>
                  <td>{formatMoneyBrl(v.price)}</td>
                  <td>{v.next_dose_at ? v.next_dose_at.slice(0, 10) : '—'}</td>
                  <td>{v.administered_at ? v.administered_at.slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
