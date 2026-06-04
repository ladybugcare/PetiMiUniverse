import React, { useEffect, useState } from 'react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import type { HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  hubClinicalApi,
  type HubHospitalBed,
  type HubHospitalization,
  type HubHospitalizationEvent,
  type HubHospitalizationEventKind,
} from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';

const STATUS_LABEL: Record<string, string> = {
  active: 'Internado',
  discharged: 'Alta',
  death: 'Óbito',
  transferred: 'Transferido',
  cancelled: 'Cancelado',
};

const EVENT_KIND_LABEL: Record<HubHospitalizationEventKind, string> = {
  vital: 'Sinais vitais',
  medication: 'Medicação',
  feeding: 'Alimentação',
  fluid: 'Fluidoterapia',
  nursing: 'Enfermagem',
  note: 'Nota',
};

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

  // Events panel
  const [eventsHospId, setEventsHospId] = useState<string | null>(null);
  const [events, setEvents] = useState<HubHospitalizationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventKind, setEventKind] = useState<HubHospitalizationEventKind>('vital');
  const [eventPayloadRaw, setEventPayloadRaw] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [eventSubmitting, setEventSubmitting] = useState(false);

  // Discharge panel
  const [dischargeHosp, setDischargeHosp] = useState<HubHospitalization | null>(null);
  const [dischargeStatus, setDischargeStatus] = useState<'discharged' | 'death' | 'transferred'>('discharged');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [dischargeSubmitting, setDischargeSubmitting] = useState(false);

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

  const openEvents = async (hospId: string) => {
    setEventsHospId(hospId);
    setEventsLoading(true);
    try {
      const r = await hubClinicalApi.listHospEvents(hospId);
      setEvents(r.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const petOptions: HubComboboxOption[] = pets.map((p) => ({ value: p.id, label: p.name }));
  const bedOptions: HubComboboxOption[] = beds
    .filter((b) => b.status === 'available' || !b.status)
    .map((b) => ({ value: b.id, label: b.label || b.code }));

  const addBed = async () => {
    if (!clinicId || !bedCode.trim()) return;
    try {
      await hubClinicalApi.createBed({ clinic_id: clinicId, code: bedCode.trim(), label: bedCode.trim() });
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

  const confirmDischarge = async () => {
    if (!clinicId || !dischargeHosp) return;
    setDischargeSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(dischargeHosp.id, {
        clinic_id: clinicId,
        status: dischargeStatus,
        discharge_notes: dischargeNotes.trim() || null,
      });
      setDischargeHosp(null);
      setDischargeNotes('');
      setDischargeStatus('discharged');
      await reload();
      showSuccess('Status atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar internação');
    } finally {
      setDischargeSubmitting(false);
    }
  };

  const addEvent = async () => {
    if (!eventsHospId) return;
    setEventSubmitting(true);
    let payload: Record<string, unknown> = {};
    if (eventPayloadRaw.trim()) {
      try {
        payload = JSON.parse(eventPayloadRaw) as Record<string, unknown>;
      } catch {
        payload = { raw: eventPayloadRaw };
      }
    }
    if (eventNote.trim()) payload.note = eventNote.trim();
    try {
      await hubClinicalApi.createHospEvent(eventsHospId, { kind: eventKind, payload });
      setEventPayloadRaw('');
      setEventNote('');
      const r = await hubClinicalApi.listHospEvents(eventsHospId);
      setEvents(r.events ?? []);
      showSuccess('Evento registrado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar evento');
    } finally {
      setEventSubmitting(false);
    }
  };

  const selectedHosp = hosp.find((h) => h.id === eventsHospId);

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
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hosp.length === 0 ? (
              <tr>
                <td colSpan={5} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 24 }}>
                  Nenhuma internação ativa.
                </td>
              </tr>
            ) : (
              hosp.map((h) => (
                <tr key={h.id}>
                  <td>{h.hub_pets?.name || h.pet_id}</td>
                  <td>{h.hub_hospital_beds?.label || h.hub_hospital_beds?.code || '—'}</td>
                  <td>{String(h.admitted_at || '').slice(0, 10)}</td>
                  <td>{STATUS_LABEL[h.status] || h.status}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => void openEvents(h.id)}
                    >
                      Eventos
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                        onClick={() => { setDischargeHosp(h); setDischargeStatus('discharged'); setDischargeNotes(''); }}
                      >
                        Alta / encerrar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Painel de admissão */}
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

      {/* Painel de eventos de internação */}
      <HubSidePanel
        open={!!eventsHospId}
        onClose={() => setEventsHospId(null)}
        title={`Eventos — ${selectedHosp?.hub_pets?.name || 'Internação'}`}
        footer={null}
      >
        <div className="hub-clientes__form-stack">
          {canWrite && (
            <>
              <span className="hub-clientes__label">Tipo de evento</span>
              <select
                className="hub-clientes__input"
                value={eventKind}
                onChange={(e) => setEventKind(e.target.value as HubHospitalizationEventKind)}
              >
                {(Object.keys(EVENT_KIND_LABEL) as HubHospitalizationEventKind[]).map((k) => (
                  <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>
                ))}
              </select>
              <span className="hub-clientes__label">Nota / observação</span>
              <textarea
                className="hub-clientes__textarea"
                rows={2}
                placeholder="Ex.: FC 90 bpm, temperatura 38°C, administrado 5 mg/kg…"
                value={eventNote}
                onChange={(e) => setEventNote(e.target.value)}
              />
              <span className="hub-clientes__label" style={{ color: 'var(--color-muted, #888)', fontSize: 12 }}>
                Payload JSON adicional (opcional)
              </span>
              <textarea
                className="hub-clientes__textarea"
                rows={2}
                placeholder='{"fc": 90, "temperatura": 38}'
                value={eventPayloadRaw}
                onChange={(e) => setEventPayloadRaw(e.target.value)}
              />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={eventSubmitting || (!eventNote.trim() && !eventPayloadRaw.trim())}
                onClick={() => void addEvent()}
              >
                {eventSubmitting ? 'Registrando…' : 'Registrar evento'}
              </button>
            </>
          )}

          <h4 style={{ margin: '16px 0 8px' }}>Histórico</h4>
          {eventsLoading && <p className="hub-clientes__muted">Carregando…</p>}
          {!eventsLoading && events.length === 0 && (
            <p className="hub-clientes__muted">Nenhum evento registrado.</p>
          )}
          {events.map((ev) => (
            <div key={ev.id} className="hub-clinic-hosp-event">
              <div className="hub-clinic-hosp-event__header">
                <span className="hub-clinic-hosp-event__kind">{EVENT_KIND_LABEL[ev.kind] || ev.kind}</span>
                <span className="hub-clinic-hosp-event__time">
                  {new Date(ev.recorded_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              {ev.payload?.note != null && (
                <p className="hub-clinic-hosp-event__note">{String(ev.payload.note)}</p>
              )}
              {Object.keys(ev.payload).filter((k) => k !== 'note').length > 0 && (
                <pre className="hub-clinic-hosp-event__payload">
                  {JSON.stringify(
                    Object.fromEntries(Object.entries(ev.payload).filter(([k]) => k !== 'note')),
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          ))}
        </div>
      </HubSidePanel>

      {/* Painel de alta / encerramento */}
      <HubSidePanel
        open={!!dischargeHosp}
        onClose={() => setDischargeHosp(null)}
        title={`Encerrar internação — ${dischargeHosp?.hub_pets?.name || ''}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setDischargeHosp(null)} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={dischargeSubmitting}
              onClick={() => void confirmDischarge()}
            >
              {dischargeSubmitting ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          <span className="hub-clientes__label">Tipo de encerramento</span>
          <select
            className="hub-clientes__input"
            value={dischargeStatus}
            onChange={(e) => setDischargeStatus(e.target.value as typeof dischargeStatus)}
          >
            <option value="discharged">Alta</option>
            <option value="death">Óbito</option>
            <option value="transferred">Transferido</option>
          </select>
          <span className="hub-clientes__label">Observações</span>
          <textarea
            className="hub-clientes__textarea"
            rows={3}
            value={dischargeNotes}
            onChange={(e) => setDischargeNotes(e.target.value)}
          />
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicHospitalPage;
