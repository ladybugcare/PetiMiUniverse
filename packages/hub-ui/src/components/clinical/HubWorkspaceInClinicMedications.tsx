import React, { useEffect, useMemo, useState } from 'react';
import {
  hubClinicalApi,
  type HubEncounter,
  type HubMedicationAdministration,
} from '../../api/hubClinicalApi';
import { useAlert } from '../AlertProvider';
import { HubCwsStatusPills } from '../../pages/clinica/HubCwsStatusPills';
import {
  emptyInClinicMedicationDraft,
  HubInClinicMedicationForm,
  type InClinicMedicationDraft,
} from './HubInClinicMedicationForm';

function formatMoneyBrl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function HubWorkspaceInClinicMedications({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
  /** Mantido por compatibilidade com o card tabulado. */
  formOnly?: boolean;
}) {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubMedicationAdministration[]>([]);
  const [draft, setDraft] = useState<InClinicMedicationDraft>(emptyInClinicMedicationDraft);
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    hubClinicalApi
      .listMedicationAdministrations(clinicId, {
        petId: encounter.pet_id ?? undefined,
        encounterId: encounter.id,
      })
      .then((r) => setItems(r.administrations ?? []));

  useEffect(() => {
    void reload();
  }, [clinicId, encounter.id, encounter.pet_id]);

  const stats = useMemo(() => {
    let comEstoque = 0;
    for (const it of items) {
      if (it.hub_inventory_item_id) comEstoque += 1;
    }
    return { total: items.length, comEstoque, semEstoque: items.length - comEstoque };
  }, [items]);

  const add = async () => {
    if (readOnly || submitting) return;
    if (!encounter.pet_id) {
      showError('Vincule um pet ao atendimento para registrar a medicação.');
      return;
    }
    if (!draft.hub_service_type_id) {
      showError('Selecione o serviço que será cobrado.');
      return;
    }
    if (draft.hub_inventory_item_id && !draft.hub_inventory_lot_id) {
      showError('Selecione o lote do medicamento.');
      return;
    }
    const qty = Number(String(draft.quantity).replace(',', '.'));
    if (!(qty > 0)) {
      showError('Informe uma quantidade válida.');
      return;
    }
    setSubmitting(true);
    try {
      await hubClinicalApi.createMedicationAdministration({
        clinic_id: clinicId,
        pet_id: encounter.pet_id,
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        hub_staff_member_id: encounter.hub_staff_member_id ?? undefined,
        hub_service_type_id: draft.hub_service_type_id,
        hub_inventory_item_id: draft.hub_inventory_item_id || undefined,
        hub_inventory_lot_id: draft.hub_inventory_lot_id || undefined,
        dose: draft.dose.trim() || undefined,
        use_route: draft.use_route.trim() || undefined,
        quantity: qty,
        notes: draft.notes.trim() || undefined,
      });
      setDraft(emptyInClinicMedicationDraft());
      await reload();
      showSuccess(
        draft.hub_inventory_item_id
          ? 'Medicação registrada. Serviço entra na comanda; estoque baixado (sem cobrança do produto).'
          : 'Medicação registrada. O serviço de aplicação entra na comanda ao cobrar.',
      );
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar medicação');
    } finally {
      setSubmitting(false);
    }
  };

  const blockReason = !encounter.pet_id
    ? 'Vincule um pet ao atendimento para registrar medicação cobrável.'
    : null;

  return (
    <>
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: stats.total },
          { label: 'Com estoque', value: stats.comEstoque, tone: 'amber' },
          { label: 'Sem baixa', value: stats.semEstoque, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Registre o que foi aplicado agora. O tutor paga o tipo de aplicação; medicamento e lote são baixa de estoque,
        sem cobrança do produto.
      </p>

      {blockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {blockReason}
        </p>
      ) : null}

      {!readOnly && encounter.pet_id ? (
        <HubInClinicMedicationForm
          clinicId={clinicId}
          draft={draft}
          onChange={setDraft}
          onSubmit={() => void add()}
          disabled={readOnly}
          submitting={submitting}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Medicações deste atendimento</strong>
          </div>
          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Aplicação</th>
                  <th>Medicamento</th>
                  <th>Dose / via</th>
                  <th>Cobrança</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong>{it.service_name}</strong>
                    </td>
                    <td className="hub-clientes__muted">
                      {it.medication_name || '—'}
                      {it.batch_number ? (
                        <div style={{ fontSize: 12 }}>lote {it.batch_number}</div>
                      ) : null}
                      {it.hub_inventory_item_id && it.quantity != null && it.quantity !== 1 ? (
                        <div style={{ fontSize: 12 }}>qtd. {it.quantity}</div>
                      ) : null}
                    </td>
                    <td className="hub-clientes__muted">{[it.dose, it.use_route].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{formatMoneyBrl(it.service_price)}</td>
                    <td className="hub-clientes__muted">
                      {it.administered_at
                        ? new Date(it.administered_at).toLocaleString('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="hub-cws-exam-empty">Nenhuma medicação aplicada neste atendimento ainda.</p>
      )}
    </>
  );
}
