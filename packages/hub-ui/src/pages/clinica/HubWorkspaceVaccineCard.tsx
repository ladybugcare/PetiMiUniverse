import React, { useEffect, useMemo, useState } from 'react';
import { hubClinicalApi, type HubEncounter, type HubVaccination } from '../../api/hubClinicalApi';
import { useAlert } from '../../components/AlertProvider';
import { HubMultiSelectCombobox } from '../../components/HubMultiSelectCombobox';
import { todayYmd } from './clinicalDisplay';
import { HubCwsStatusPills } from './HubCwsStatusPills';
import { uniqueVaccineNames, vaccineCardOptions } from './vaccineCardOptions';

const emptyDraft = () => ({
  vaccine_names: [] as string[],
  administered_at: todayYmd(),
  batch_number: '',
  next_dose_at: '',
  notes: '',
});

function originLabel(source: string | null | undefined): string {
  return source === 'external' ? 'Carteirinha' : 'Na clínica';
}

export function HubWorkspaceVaccineCard({
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
  const [draft, setDraft] = useState(emptyDraft);
  const [submitting, setSubmitting] = useState(false);

  const reload = () =>
    hubClinicalApi.listVaccinations(clinicId, encounter.pet_id ?? undefined).then((r) => {
      setItems(r.vaccinations ?? []);
    });

  useEffect(() => {
    void reload().catch(() => setItems([]));
  }, [clinicId, encounter.pet_id]);

  const rows = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ta = new Date(a.administered_at || 0).getTime();
        const tb = new Date(b.administered_at || 0).getTime();
        return tb - ta;
      }),
    [items],
  );

  const stats = useMemo(() => {
    let naClinica = 0;
    let carteirinha = 0;
    for (const v of rows) {
      if (v.source === 'external') carteirinha += 1;
      else naClinica += 1;
    }
    return { total: rows.length, naClinica, carteirinha };
  }, [rows]);

  const nameOptions = useMemo(() => vaccineCardOptions(draft.vaccine_names), [draft.vaccine_names]);
  const blockReason = !encounter.pet_id ? 'Vincule um pet ao atendimento para registrar a carteirinha.' : null;

  const add = async () => {
    const names = uniqueVaccineNames(draft.vaccine_names);
    if (readOnly || submitting || !names.length || !draft.administered_at) return;
    if (!encounter.pet_id) {
      showError('Vincule um pet ao atendimento para registrar a carteirinha.');
      return;
    }
    setSubmitting(true);
    try {
      const shared = {
        clinic_id: clinicId,
        pet_id: encounter.pet_id,
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        hub_staff_member_id: encounter.hub_staff_member_id ?? undefined,
        batch_number: draft.batch_number.trim() || undefined,
        administered_at: draft.administered_at,
        next_dose_at: draft.next_dose_at.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        source: 'external' as const,
      };
      for (const vaccine_name of names) {
        await hubClinicalApi.createVaccination({ ...shared, vaccine_name });
      }
      setDraft(emptyDraft());
      await reload();
      showSuccess(names.length === 1 ? 'Vacina da carteirinha registrada' : `${names.length} vacinas da carteirinha registradas`);
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar vacina da carteirinha');
      await reload().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: stats.total },
          { label: 'Na clínica', value: stats.naClinica, tone: 'amber' },
          { label: 'Carteirinha', value: stats.carteirinha, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Transcreva as vacinas da carteirinha. Dá para marcar várias do mesmo dia. O que for aplicado agora nesta
        consulta fica em Aplicado agora.
      </p>

      {blockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {blockReason}
        </p>
      ) : null}

      {!readOnly && encounter.pet_id ? (
        <div className="hub-cws-exam-form">
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="card-vac-names">Vacinas</label>
            <HubMultiSelectCombobox
              id="card-vac-names"
              options={nameOptions}
              value={draft.vaccine_names}
              onChange={(next) => setDraft((d) => ({ ...d, vaccine_names: uniqueVaccineNames(next) }))}
              placeholder="Buscar e marcar várias, ou criar outra…"
              searchPlaceholder="V10, antirrábica, tríplice…"
              allowCreate
              createEntityLabel="vacina"
              ariaLabel="Vacinas da carteirinha"
            />
          </div>

          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="card-vac-date">Data da aplicação</label>
              <input
                id="card-vac-date"
                type="date"
                value={draft.administered_at}
                onChange={(e) => setDraft((d) => ({ ...d, administered_at: e.target.value }))}
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="card-vac-lot">Lote / ref.</label>
              <input
                id="card-vac-lot"
                value={draft.batch_number}
                onChange={(e) => setDraft((d) => ({ ...d, batch_number: e.target.value }))}
                placeholder={
                  draft.vaccine_names.length > 1 ? 'Opcional — vale para todas' : 'Opcional'
                }
              />
            </div>
          </div>

          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="card-vac-next">Próxima dose</label>
              <input
                id="card-vac-next"
                type="date"
                value={draft.next_dose_at}
                onChange={(e) => setDraft((d) => ({ ...d, next_dose_at: e.target.value }))}
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="card-vac-notes">Observações</label>
              <input
                id="card-vac-notes"
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder={
                  draft.vaccine_names.length > 1
                    ? 'Opcional — vale para todas'
                    : 'Opcional — clínica de origem, protocolo'
                }
              />
            </div>
          </div>

          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={!draft.vaccine_names.length || !draft.administered_at || submitting}
            onClick={() => void add()}
          >
            {submitting
              ? 'Registrando…'
              : draft.vaccine_names.length > 1
                ? `Adicionar ${draft.vaccine_names.length} vacinas`
                : 'Adicionar à carteirinha'}
          </button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 0 }}>
          <div className="hub-rx-panel__head">
            <strong>Histórico vacinal do pet</strong>
          </div>
          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Vacina</th>
                  <th>Lote</th>
                  <th>Origem</th>
                  <th>Aplicada em</th>
                  <th>Próxima dose</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.vaccine_name}</strong>
                      {v.notes ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          {v.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="hub-clientes__muted">{v.batch_number ?? '—'}</td>
                    <td>{originLabel(v.source)}</td>
                    <td className="hub-clientes__muted">
                      {v.administered_at ? v.administered_at.slice(0, 10) : '—'}
                    </td>
                    <td className="hub-clientes__muted">{v.next_dose_at ? v.next_dose_at.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="hub-cws-exam-empty">Nenhuma vacina na carteirinha deste pet ainda.</p>
      )}
    </>
  );
}
