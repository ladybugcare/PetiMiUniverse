import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import { hubClinicalApi, type HubHospitalBed, type HubHospitalization } from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';

const HubClinicHospitalPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const [beds, setBeds] = useState<HubHospitalBed[]>([]);
  const [hosp, setHosp] = useState<HubHospitalization[]>([]);
  const [bedCode, setBedCode] = useState('');
  const [admitOpen, setAdmitOpen] = useState(false);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [petId, setPetId] = useState('');
  const [bedId, setBedId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    if (!clinicId) return;
    const [b, h] = await Promise.all([
      hubClinicalApi.listBeds(clinicId),
      hubClinicalApi.listHospitalizations(clinicId, 'active'),
    ]);
    setBeds(b.beds ?? []);
    setHosp(h.hospitalizations ?? []);
  };

  useEffect(() => {
    if (!canRead) return;
    void reload().catch(() => {});
  }, [clinicId, canRead]);

  useEffect(() => {
    if (!clinicId || !admitOpen) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
  }, [clinicId, admitOpen]);

  const petOptions: HubComboboxOption[] = pets.map((p) => ({ value: p.id, label: p.name }));
  const bedOptions: HubComboboxOption[] = beds
    .filter((b) => b.status === 'available' || !b.status)
    .map((b) => ({ value: b.id, label: b.label || b.code }));

  const addBed = async () => {
    if (!clinicId || !bedCode.trim()) return;
    try {
      await hubClinicalApi.createBed({
        clinic_id: clinicId,
        code: bedCode.trim(),
        label: bedCode.trim(),
      });
      setBedCode('');
      await reload();
      showSuccess('Leito criado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar leito');
    }
  };

  const admit = async () => {
    if (!clinicId || !petId) return;
    setSubmitting(true);
    try {
      await hubClinicalApi.createHospitalization({
        clinic_id: clinicId,
        pet_id: petId,
        hub_hospital_bed_id: bedId || null,
        admission_notes: notes.trim() || null,
      });
      setAdmitOpen(false);
      setPetId('');
      setBedId('');
      setNotes('');
      await reload();
      showSuccess('Internação registrada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao internar');
    } finally {
      setSubmitting(false);
    }
  };

  const discharge = async (id: string) => {
    if (!clinicId || !canWrite) return;
    try {
      await hubClinicalApi.patchHospitalization(id, { clinic_id: clinicId, status: 'discharged' });
      await reload();
      showSuccess('Alta registrada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao dar alta');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  return (
    <div className="hub-clinic-hospital">
      {canWrite && (
        <div className="hub-clientes__toolbar">
          <input
            className="hub-clientes__input hub-clinic-hospital__bed-input"
            placeholder="Código do leito"
            value={bedCode}
            onChange={(e) => setBedCode(e.target.value)}
          />
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => void addBed()}>
            Adicionar leito
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setAdmitOpen(true)}>
            Internar pet
          </button>
        </div>
      )}

      <h3 className="hub-clinic-section-title">Mapa de leitos</h3>
      <div className="hub-clinic-beds-grid">
        {beds.map((b) => {
          const st = String(b.status || 'available');
          return (
            <div key={b.id} className={`hub-clinic-bed hub-clinic-bed--${st}`}>
              {b.label || b.code}
              <div className="hub-clinic-bed__status">{st}</div>
            </div>
          );
        })}
        {beds.length === 0 && <p className="hub-clientes__muted">Nenhum leito configurado.</p>}
      </div>

      <h3 className="hub-clinic-section-title">Internações ativas</h3>
      <div className="hub-clientes__table-wrap">
        <table className="hub-clientes__table">
          <thead>
            <tr>
              <th>Pet</th>
              <th>Leito</th>
              <th>Entrada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hosp.length === 0 ? (
              <tr>
                <td colSpan={4} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nenhuma internação ativa.
                </td>
              </tr>
            ) : (
              hosp.map((h) => (
                <tr key={h.id}>
                  <td>{h.hub_pets?.name || h.pet_id}</td>
                  <td>{h.hub_hospital_beds?.label || h.hub_hospital_beds?.code || '—'}</td>
                  <td>{String(h.admitted_at || '').slice(0, 10)}</td>
                  <td>
                    {canWrite ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => void discharge(h.id)}
                      >
                        Alta
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
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        title="Internar pet"
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setAdmitOpen(false)} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={submitting || !petId}
              onClick={() => void admit()}
            >
              {submitting ? 'Salvando…' : 'Confirmar internação'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <span className="hub-clientes__label">Pet</span>
          <HubSearchableCombobox
            id="clinic-admit-pet"
            className="hub-combobox--clientes"
            options={petOptions}
            value={petId}
            onChange={setPetId}
            placeholder="Buscar pet…"
          />
          <span className="hub-clientes__label">Leito (opcional)</span>
          <HubSearchableCombobox
            id="clinic-admit-bed"
            className="hub-combobox--clientes"
            options={bedOptions}
            value={bedId}
            onChange={setBedId}
            placeholder="Selecionar leito…"
          />
          <span className="hub-clientes__label">Observações de admissão</span>
          <textarea className="hub-clientes__textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicHospitalPage;
