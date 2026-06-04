import React, { useEffect, useMemo, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubClinicalApi, type HubSurgery } from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const HubClinicSurgeriesPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const [rows, setRows] = useState<HubSurgery[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [petId, setPetId] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = () => {
    if (!clinicId) return Promise.resolve();
    return hubClinicalApi.listSurgeries(clinicId).then((r) => setRows(r.surgeries ?? []));
  };

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void reload().catch(() => setRows([]));
  }, [clinicId, canRead]);

  useEffect(() => {
    if (!clinicId || !createOpen) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
  }, [clinicId, createOpen]);

  const petOptions: HubComboboxOption[] = useMemo(
    () => pets.map((p) => ({ value: p.id, label: p.name })),
    [pets],
  );

  const create = async () => {
    if (!clinicId || !petId || !title.trim()) return;
    setSubmitting(true);
    try {
      await hubClinicalApi.createSurgery({
        clinic_id: clinicId,
        pet_id: petId,
        title: title.trim(),
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      setCreateOpen(false);
      setPetId('');
      setTitle('');
      setScheduledAt('');
      await reload();
      showSuccess('Cirurgia agendada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar cirurgia');
    } finally {
      setSubmitting(false);
    }
  };

  const patchStatus = async (id: string, status: string) => {
    if (!clinicId) return;
    try {
      await hubClinicalApi.patchSurgery(id, { clinic_id: clinicId, status });
      await reload();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar cirurgia');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  return (
    <div className="hub-clinic-surgeries">
      {canWrite && (
        <div className="hub-clientes__toolbar">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setCreateOpen(true)}>
            Nova cirurgia
          </button>
        </div>
      )}

      <div className="hub-clientes__table-wrap">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Status</th>
              <th>Agendada</th>
              <th>Pet</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 28 }}>
                  Nenhuma cirurgia registrada.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{STATUS_LABEL[s.status] || s.status}</td>
                  <td>{s.scheduled_at ? String(s.scheduled_at).slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{s.hub_pets?.name || s.pet_id}</td>
                  <td>
                    {canWrite && s.status === 'scheduled' ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => void patchStatus(s.id, 'in_progress')}
                      >
                        Iniciar
                      </button>
                    ) : null}
                    {canWrite && s.status === 'in_progress' ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        onClick={() => void patchStatus(s.id, 'completed')}
                      >
                        Concluir
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <HubSidePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova cirurgia"
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setCreateOpen(false)} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={submitting || !petId || !title.trim()}
              onClick={() => void create()}
            >
              {submitting ? 'Salvando…' : 'Agendar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="clinic-surgery-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet…"
          />
          <span className="hub-clientes__label">Procedimento</span>
          <input className="hub-clientes__input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <span className="hub-clientes__label">Data e hora</span>
          <input
            type="datetime-local"
            className="hub-clientes__input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicSurgeriesPage;
