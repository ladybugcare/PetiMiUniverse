import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubClinicalCasesApi,
  hubClinicalTimelineApi,
  hubEncountersApi,
  hubClinicalApi,
  type HubClinicalCase,
  type HubClinicalCaseStatus,
  type HubClinicalTimelineEvent,
  type HubEncounter,
  type HubPrescription,
  type HubVaccination,
} from '../../api/hubClinicalApi';
import { ComandaCheckoutDrawer } from '../finance/ComandaCheckoutDrawer';
import { formatPrescriptionLine } from './clinicalDisplay';

type TabId = 'timeline' | 'atendimentos' | 'prescricoes' | 'vacinas';

const STATUS_LABELS: Record<HubClinicalCaseStatus, string> = {
  active: 'Ativo',
  monitoring: 'Monitoramento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

const STATUS_OPTIONS: { value: HubClinicalCaseStatus; label: string }[] = [
  { value: 'active', label: 'Ativo' },
  { value: 'monitoring', label: 'Monitoramento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const HubClinicCasePage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const [clinicalCase, setClinicalCase] = useState<HubClinicalCase | null>(null);
  const [tab, setTab] = useState<TabId>('timeline');
  const [timelineEvents, setTimelineEvents] = useState<HubClinicalTimelineEvent[]>([]);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<HubClinicalCaseStatus>('active');
  const [savingStatus, setSavingStatus] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutEncounterId, setCheckoutEncounterId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clinicId || !caseId) return;
    setLoading(true);
    try {
      const [caseRes, tlRes] = await Promise.allSettled([
        hubClinicalCasesApi.get(caseId, clinicId),
        hubClinicalTimelineApi.list(clinicId, { caseId }),
      ]);

      const theCase = caseRes.status === 'fulfilled' ? caseRes.value.case : null;
      setClinicalCase(theCase ?? null);
      if (theCase) setNewStatus(theCase.status);

      setTimelineEvents(tlRes.status === 'fulfilled' ? tlRes.value.events : []);

      if (theCase?.pet_id && clinicId) {
        const [encFull, rxFull, vaxFull] = await Promise.allSettled([
          hubEncountersApi.listByPet(clinicId, theCase.pet_id),
          hubClinicalApi.listPrescriptions(clinicId, theCase.pet_id),
          hubClinicalApi.listVaccinations(clinicId, theCase.pet_id),
        ]);
        const allEnc = encFull.status === 'fulfilled' ? encFull.value.encounters : [];
        setEncounters(allEnc.filter((e) => e.hub_case_id === caseId));
        setPrescriptions(rxFull.status === 'fulfilled' ? rxFull.value.prescriptions : []);
        setVaccinations(vaxFull.status === 'fulfilled' ? vaxFull.value.vaccinations : []);
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar caso clínico');
    } finally {
      setLoading(false);
    }
  }, [clinicId, caseId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openComandaForCase = () => {
    // Find the most recent completed encounter for this case to bill
    const completedEnc = [...encounters]
      .filter((e) => e.status === 'completed')
      .sort((a, b) => new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime())[0];
    if (!completedEnc) {
      showError('Nenhum atendimento concluído encontrado para gerar comanda.');
      return;
    }
    setCheckoutEncounterId(completedEnc.id);
    setCheckoutOpen(true);
  };

  const handleStatusSave = async () => {
    if (!clinicId || !caseId || !canWrite) return;
    setSavingStatus(true);
    try {
      const { case: updated } = await hubClinicalCasesApi.patch(caseId, {
        clinic_id: clinicId,
        status: newStatus,
      });
      setClinicalCase(updated);
      setEditingStatus(false);
      showSuccess('Status do caso atualizado');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar status');
    } finally {
      setSavingStatus(false);
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para casos clínicos.</p>;
  }

  if (loading) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Carregando caso clínico…</p>;
  }

  if (!clinicalCase) {
    return (
      <div className="hub-clinic-page__pad">
        <p className="hub-clientes__muted">Caso clínico não encontrado.</p>
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--secondary hub-clientes__btn--sm"
          onClick={() => navigate(-1)}
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="hub-clinic-case-page">
      <div className="hub-clinic-case-page__header">
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
          onClick={() => navigate(-1)}
        >
          ← Voltar
        </button>

        <div className="hub-clinic-case-page__title-row">
          <h1 className="hub-clinic-case-page__title">{clinicalCase.title}</h1>
          <div className="hub-clinic-case-page__status-area">
            {editingStatus ? (
              <div className="hub-clinic-case-page__status-edit">
                <select
                  className="hub-clientes__input"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as HubClinicalCaseStatus)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={savingStatus}
                  onClick={() => void handleStatusSave()}
                >
                  {savingStatus ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                  onClick={() => setEditingStatus(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${clinicalCase.status}`}>
                  {STATUS_LABELS[clinicalCase.status]}
                </span>
                {canWrite && (
                  <>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => setEditingStatus(true)}
                    >
                      Alterar status
                    </button>
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                      onClick={openComandaForCase}
                    >
                      Abrir comanda
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {clinicalCase.summary && (
          <p className="hub-clinic-case-page__summary">{clinicalCase.summary}</p>
        )}

        <div className="hub-clinic-case-page__meta">
          {clinicalCase.pet && (
            <span>
              Pet:{' '}
              <Link to={`/hub/clinica/prontuarios?petId=${clinicalCase.pet_id}`} className="hub-clientes__link">
                {clinicalCase.pet.name}
              </Link>
            </span>
          )}
          <span>Aberto em {new Date(clinicalCase.opened_at).toLocaleDateString('pt-BR')}</span>
          {clinicalCase.closed_at && (
            <span>Fechado em {new Date(clinicalCase.closed_at).toLocaleDateString('pt-BR')}</span>
          )}
          {clinicalCase.primary_veterinarian && (
            <span>Veterinário: {clinicalCase.primary_veterinarian.full_name}</span>
          )}
        </div>

        {clinicalCase.tags.length > 0 && (
          <div className="hub-clinic-case-page__tags">
            {clinicalCase.tags.map((tag) => (
              <span key={tag} className="hub-clinic-alert-chip">
                {tag}
              </span>
            ))}
          </div>
        )}

        {canWrite && (
          <div className="hub-clinic-case-page__actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => {
                if (!clinicId || !clinicalCase) return;
                void hubEncountersApi
                  .create({
                    clinic_id: clinicId,
                    pet_id: clinicalCase.pet_id,
                    hub_case_id: clinicalCase.id,
                  })
                  .then(({ encounter }) => navigate(`/hub/clinica/atendimentos/${encounter.id}`))
                  .catch((e: unknown) => showError((e as Error)?.message || 'Erro ao criar atendimento'));
              }}
            >
              + Novo atendimento neste caso
            </button>
          </div>
        )}
      </div>

      <HubTabs
        className="hub-clinic-case-page__tabs"
        ariaLabel="Caso clínico"
        variant="page"
        activeId={tab}
        onTabChange={(id) => setTab(id as TabId)}
        items={[
          { id: 'timeline', label: 'Linha do tempo' },
          { id: 'atendimentos', label: `Atendimentos (${encounters.length})` },
          { id: 'prescricoes', label: 'Prescrições' },
          { id: 'vacinas', label: 'Vacinas' },
        ]}
      />

      {tab === 'timeline' && (
        <div className="hub-clinic-timeline">
          {timelineEvents.length === 0 ? (
            <p className="hub-clientes__muted">Nenhum evento clínico registrado neste caso.</p>
          ) : (
            timelineEvents.map((ev) => (
              <div key={ev.id} className="hub-clinic-timeline__item">
                <strong>{ev.title}</strong>
                {ev.body ? <p className="hub-clinic-timeline__body">{ev.body}</p> : null}
                <small className="hub-clientes__muted">
                  {new Date(ev.event_at).toLocaleString('pt-BR')}
                  {ev.created_by_member ? ` · ${ev.created_by_member.full_name}` : ''}
                </small>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'atendimentos' && (
        <div className="hub-clinic-records__list">
          {encounters.length === 0 ? (
            <p className="hub-clientes__muted">Nenhum atendimento neste caso.</p>
          ) : (
            encounters.map((e) => (
              <div key={e.id} className="hub-clinic-timeline__item">
                <strong>
                  {e.encounter_type === 'return' && 'Retorno'}
                  {e.encounter_type === 'emergency' && 'Urgência/Emergência'}
                  {e.encounter_type === 'procedure' && 'Procedimento'}
                  {(!e.encounter_type || e.encounter_type === 'consultation') && 'Consulta'}
                  {' — '}
                  {e.status === 'completed' ? 'Finalizado' : e.status === 'cancelled' ? 'Cancelado' : 'Em andamento'}
                </strong>
                <p className="hub-clinic-timeline__body">{e.chief_complaint || e.summary_notes || '—'}</p>
                {e.started_at && (
                  <small className="hub-clientes__muted">
                    {new Date(e.started_at).toLocaleDateString('pt-BR')}
                  </small>
                )}
                <Link to={`/hub/clinica/atendimentos/${e.id}`} className="hub-clientes__link">
                  Abrir atendimento →
                </Link>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'prescricoes' && (
        <ul className="hub-clinic-records__list">
          {prescriptions.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma prescrição.</li>
          ) : (
            prescriptions.map((p) => <li key={p.id}>{formatPrescriptionLine(p)}</li>)
          )}
        </ul>
      )}

      {tab === 'vacinas' && (
        <ul className="hub-clinic-records__list">
          {vaccinations.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma vacina registrada.</li>
          ) : (
            vaccinations.map((v) => (
              <li key={v.id}>
                {v.vaccine_name} — {v.administered_at}
                {v.next_dose_at ? ` · Próxima: ${v.next_dose_at}` : ''}
              </li>
            ))
          )}
        </ul>
      )}

      {clinicId && checkoutOpen && checkoutEncounterId && (
        <ComandaCheckoutDrawer
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          clinicId={clinicId}
          unitId={clinicalCase.unit_id ?? clinicId}
          originType="encounter"
          originId={checkoutEncounterId}
          onSuccess={() => {
            showSuccess('Comanda aberta com sucesso.');
            setCheckoutOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default HubClinicCasePage;
