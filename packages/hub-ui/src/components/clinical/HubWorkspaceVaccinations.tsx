import React, { useEffect, useMemo, useState } from 'react';
import { hubClinicalApi, type HubEncounter, type HubVaccination } from '../../api/hubClinicalApi';
import { useAlert } from '../AlertProvider';
import { HubCwsStatusPills } from '../../pages/clinica/HubCwsStatusPills';
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

function isInClinicEncounterVaccine(v: HubVaccination, encounterId: string): boolean {
  return v.source !== 'external' && v.hub_encounter_id === encounterId;
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
  formOnly?: boolean;
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
    if (!draft.hub_inventory_item_id) {
      showError('Selecione a vacina do estoque.');
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
        source: 'in_clinic',
        hub_inventory_item_id: draft.hub_inventory_item_id,
        hub_inventory_lot_id: draft.hub_inventory_lot_id || undefined,
      });
      const withLot = Boolean(draft.hub_inventory_lot_id);
      setDraft(emptyVaccinationFormDraft());
      await reload();
      showSuccess(withLot ? 'Vacina registrada e estoque atualizado.' : 'Vacina registrada.');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar vacina');
    } finally {
      setSubmitting(false);
    }
  };

  const vacRows = items.filter((v) => isInClinicEncounterVaccine(v, encounter.id));

  const stats = useMemo(() => {
    const comProxima = vacRows.filter((v) => Boolean(v.next_dose_at)).length;
    return { total: vacRows.length, aplicadas: vacRows.length, comProxima };
  }, [vacRows]);

  const blockReason = !encounter.pet_id ? 'Vincule um pet ao atendimento para registrar vacina.' : null;

  return (
    <>
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: stats.total },
          { label: 'Aplicadas', value: stats.aplicadas, tone: 'amber' },
          { label: 'Próxima dose', value: stats.comProxima, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Registre a vacina aplicada agora nesta consulta e baixe o estoque. O histórico da carteirinha fica na seção
        Carteirinha.
      </p>

      {blockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {blockReason}
        </p>
      ) : null}

      {!readOnly && encounter.pet_id ? (
        <HubVaccinationForm
          clinicId={clinicId}
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void add()}
          disabled={readOnly}
          submitting={submitting}
        />
      ) : null}

      {vacRows.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Vacinas aplicadas neste atendimento</strong>
          </div>
          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Vacina</th>
                  <th>Lote</th>
                  <th>Preço</th>
                  <th>Próxima dose</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {vacRows.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.vaccine_name}</strong>
                    </td>
                    <td className="hub-clientes__muted">{v.batch_number ?? '—'}</td>
                    <td>{formatMoneyBrl(v.price)}</td>
                    <td className="hub-clientes__muted">{v.next_dose_at ? v.next_dose_at.slice(0, 10) : '—'}</td>
                    <td className="hub-clientes__muted">{v.administered_at ? v.administered_at.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="hub-cws-exam-empty">Nenhuma vacina aplicada neste atendimento ainda.</p>
      )}
    </>
  );
}
