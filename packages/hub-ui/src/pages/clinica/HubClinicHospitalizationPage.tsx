import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import {
  hubClinicalApi,
  type HubHospitalBed,
  type HubHospitalization,
  type HubHospitalizationEvent,
  type HubHospitalizationEventKind,
} from '../../api/hubClinicalApi';
import HospEventForm from './hospital/HospEventForm';
import HospEventList from './hospital/HospEventList';
import HospBedAssignPanel from './hospital/HospBedAssignPanel';
import { formatHospDate, HOSP_STATUS_LABEL } from './hospital/hospDisplay';

const HubClinicHospitalizationPage: React.FC = () => {
  const { hospitalizationId } = useParams<{ hospitalizationId: string }>();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const [hosp, setHosp] = useState<HubHospitalization | null>(null);
  const [events, setEvents] = useState<HubHospitalizationEvent[]>([]);
  const [beds, setBeds] = useState<HubHospitalBed[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [assignBedOpen, setAssignBedOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [dischargeStatus, setDischargeStatus] = useState<'discharged' | 'death' | 'transferred'>('discharged');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [dischargeSubmitting, setDischargeSubmitting] = useState(false);

  const reload = async () => {
    if (!clinicId || !hospitalizationId) return;
    const [h, bedRes] = await Promise.all([
      hubClinicalApi.getHospitalization(hospitalizationId, clinicId),
      hubClinicalApi.listBeds(clinicId).catch(() => ({ beds: [] as HubHospitalBed[] })),
    ]);
    setHosp(h.hospitalization);
    setBeds(bedRes.beds ?? []);
    try {
      const ev = await hubClinicalApi.listHospEvents(hospitalizationId, undefined, clinicId);
      setEvents(ev.events ?? []);
    } catch {
      setEvents([]);
    }
  };

  useEffect(() => {
    if (!canRead || !clinicId || !hospitalizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void reload()
      .catch((e: unknown) => {
        showError((e as Error)?.message || 'Erro ao carregar internação');
        setHosp(null);
      })
      .finally(() => setLoading(false));
  }, [clinicId, hospitalizationId, canRead]);

  const addEvent = async (kind: HubHospitalizationEventKind, payload: Record<string, unknown>) => {
    if (!hospitalizationId) return;
    setEventSubmitting(true);
    try {
      await hubClinicalApi.createHospEvent(hospitalizationId, { kind, payload }, clinicId);
      const r = await hubClinicalApi.listHospEvents(hospitalizationId, undefined, clinicId);
      setEvents(r.events ?? []);
      showSuccess('Evento registrado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar evento');
    } finally {
      setEventSubmitting(false);
    }
  };

  const confirmDischarge = async () => {
    if (!clinicId || !hosp) return;
    setDischargeSubmitting(true);
    try {
      await hubClinicalApi.patchHospitalization(hosp.id, {
        clinic_id: clinicId,
        status: dischargeStatus,
        discharge_notes: dischargeNotes.trim() || null,
      });
      setDischargeOpen(false);
      setDischargeNotes('');
      await reload();
      showSuccess('Internação encerrada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao encerrar internação');
    } finally {
      setDischargeSubmitting(false);
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  if (loading) {
    return <HubLoading variant="block" label="Carregando internação…" />;
  }

  if (!hosp) {
    return (
      <div className="hub-hosp-detail">
        <Link to="/hub/clinica" className="hub-clientes__link hub-hosp-detail__back">
          <ArrowLeft size={16} aria-hidden /> Voltar ao consultório
        </Link>
        <p className="hub-clientes__muted">Internação não encontrada.</p>
      </div>
    );
  }

  const isActive = hosp.status === 'active';
  const petName = hosp.hub_pets?.name || 'Pet';
  const bedLabel = hosp.hub_hospital_beds?.label || hosp.hub_hospital_beds?.code;
  const reason = hosp.reason?.trim() || '';
  const notes = hosp.admission_notes?.trim() || '';

  return (
    <div className="hub-hosp-detail">
      <button type="button" className="hub-clientes__link-btn hub-hosp-detail__back" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} aria-hidden /> Voltar
      </button>

      <header className="hub-hosp-detail__hero">
        <div className="hub-hosp-detail__hero-top">
          <div>
            <p className="hub-hosp-detail__eyebrow">Internação</p>
            <h1 className="hub-hosp-detail__title">{petName}</h1>
            <p className="hub-hosp-detail__meta">
              {bedLabel ? `Leito ${bedLabel}` : 'Sem leito'}
              {' · '}
              Entrada {formatHospDate(hosp.admitted_at)}
              {hosp.discharged_at ? ` · Encerrada ${formatHospDate(hosp.discharged_at)}` : ''}
              {hosp.hub_guardians?.full_name ? ` · Tutor ${hosp.hub_guardians.full_name}` : ''}
            </p>
          </div>
          <span className={`hub-hosp-status hub-hosp-status--${hosp.status}`}>
            {HOSP_STATUS_LABEL[hosp.status] ?? hosp.status}
          </span>
        </div>

        <div className="hub-hosp-detail__actions">
          {hosp.hub_case_id ? (
            <Link to={`/hub/clinica/casos/${hosp.hub_case_id}`} className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm">
              Ver caso clínico
            </Link>
          ) : (
            <span className="hub-clientes__muted">Sem caso vinculado</span>
          )}
          {canWrite && isActive ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => setAssignBedOpen(true)}
            >
              {bedLabel ? 'Trocar leito' : 'Atribuir leito'}
            </button>
          ) : null}
          {canWrite && isActive ? (
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
              onClick={() => {
                setDischargeStatus('discharged');
                setDischargeNotes('');
                setDischargeOpen(true);
              }}
            >
              Alta / encerrar
            </button>
          ) : null}
        </div>

        {reason ? <p className="hub-hosp-detail__notes hub-hosp-detail__notes--reason">Motivo: {reason}</p> : null}
        {notes ? <p className="hub-hosp-detail__notes">{notes}</p> : null}
        {hosp.discharge_notes ? (
          <p className="hub-hosp-detail__notes hub-hosp-detail__notes--out">Alta: {hosp.discharge_notes}</p>
        ) : null}
      </header>

      {canWrite && isActive ? (
        <section className="hub-hosp-detail__block">
          <h2 className="hub-hosp-detail__block-title">Registrar evento</h2>
          <p className="hub-hosp-detail__block-lead">
            Anote vitais, medicação, alimentação ou evolução sem sair da internação.
          </p>
          <HospEventForm
            clinicId={clinicId ?? ''}
            species={hosp.hub_pets?.species}
            canCreateLookups={canWrite}
            submitting={eventSubmitting}
            onSubmit={addEvent}
          />
        </section>
      ) : null}

      <section className="hub-hosp-detail__block">
        <h2 className="hub-hosp-detail__block-title">Histórico</h2>
        <HospEventList events={events} />
      </section>

      {clinicId ? (
        <HospBedAssignPanel
          open={assignBedOpen}
          clinicId={clinicId}
          hospitalization={hosp}
          beds={beds}
          onClose={() => setAssignBedOpen(false)}
          onAssigned={() => reload()}
        />
      ) : null}

      <HubSidePanel
        open={dischargeOpen}
        onClose={() => setDischargeOpen(false)}
        title={`Encerrar internação — ${petName}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => setDischargeOpen(false)} />
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

export default HubClinicHospitalizationPage;
