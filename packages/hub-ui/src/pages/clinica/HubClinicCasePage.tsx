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
  hubClinicalExamsApi,
  type HubClinicalCase,
  type HubClinicalCaseStatus,
  type HubClinicalTimelineEvent,
  type HubEncounter,
  type HubPrescription,
  type HubVaccination,
  type HubHospitalization,
  type HubSurgery,
  type HubClinicalAttachment,
  type HubClinicalExam,
} from '../../api/hubClinicalApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import {
  attachmentPublicUrl,
  formatHubClinicalExamStatus,
  formatHubComandaStatus,
  formatPrescriptionLine,
} from './clinicalDisplay';

type TabId =
  | 'resumo'
  | 'timeline'
  | 'atendimentos'
  | 'prescricoes'
  | 'vacinas'
  | 'internacoes'
  | 'cirurgias'
  | 'exames'
  | 'anexos'
  | 'financeiro';

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

const SURGERY_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const HOSP_STATUS_LABELS: Record<string, string> = {
  active: 'Ativa',
  discharged: 'Alta',
  death: 'Óbito',
  transferred: 'Transferida',
  cancelled: 'Cancelada',
};

const HubClinicCasePage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const canFinancial = hasPermission('hub.financial.read');
  const canCreateReceivable = hasPermission('hub.receivables.create');

  const [clinicalCase, setClinicalCase] = useState<HubClinicalCase | null>(null);
  const [tab, setTab] = useState<TabId>('resumo');
  const [timelineEvents, setTimelineEvents] = useState<HubClinicalTimelineEvent[]>([]);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HubHospitalization[]>([]);
  const [surgeries, setSurgeries] = useState<HubSurgery[]>([]);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [attachments, setAttachments] = useState<HubClinicalAttachment[]>([]);
  const [comandas, setComandas] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<HubClinicalCaseStatus>('active');
  const [savingStatus, setSavingStatus] = useState(false);

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
        const encP = hubEncountersApi.listByPet(clinicId, theCase.pet_id);
        const rxP = hubClinicalApi.listPrescriptions(clinicId, theCase.pet_id, caseId);
        const vaxP = hubClinicalApi.listVaccinations(clinicId, theCase.pet_id, caseId);
        const hospP = hubClinicalApi.listHospitalizations(clinicId, undefined, caseId);
        const surgP = hubClinicalApi.listSurgeries(clinicId, undefined, caseId);
        const examP = hubClinicalExamsApi.list(clinicId, { caseId, petId: theCase.pet_id });
        const attP = hubClinicalApi.listAttachments(clinicId, { petId: theCase.pet_id });
        const comP = canFinancial
          ? hubComandaApi.listComandas({ clinic_id: clinicId, hub_case_id: caseId }).catch(() => ({ comandas: [] }))
          : Promise.resolve({ comandas: [] });

        const [encFull, rxFull, vaxFull, hospFull, surgFull, examFull, attFull, comFull] = await Promise.allSettled([
          encP,
          rxP,
          vaxP,
          hospP,
          surgP,
          examP,
          attP,
          comP,
        ]);

        const allEnc = encFull.status === 'fulfilled' ? encFull.value.encounters : [];
        const encForCase = allEnc.filter((e) => e.hub_case_id === caseId);
        setEncounters(encForCase);

        const examList = examFull.status === 'fulfilled' ? examFull.value.exams : [];
        setExams(examList);

        setPrescriptions(rxFull.status === 'fulfilled' ? rxFull.value.prescriptions : []);
        setVaccinations(vaxFull.status === 'fulfilled' ? vaxFull.value.vaccinations : []);
        setHospitalizations(hospFull.status === 'fulfilled' ? hospFull.value.hospitalizations : []);
        setSurgeries(surgFull.status === 'fulfilled' ? surgFull.value.surgeries : []);

        const examIds = new Set(examList.map((x) => x.id));
        const encIds = new Set(encForCase.map((e) => e.id));
        const allAtt = attFull.status === 'fulfilled' ? attFull.value.attachments : [];
        setAttachments(
          allAtt.filter((a) => {
            if (a.hub_exam_id && examIds.has(a.hub_exam_id)) return true;
            if (a.hub_encounter_id && encIds.has(a.hub_encounter_id)) return true;
            return false;
          }),
        );

        setComandas(comFull.status === 'fulfilled' ? comFull.value.comandas ?? [] : []);
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar caso clínico');
    } finally {
      setLoading(false);
    }
  }, [clinicId, caseId, showError, canFinancial]);

  useEffect(() => {
    void load();
  }, [load]);


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

  const cancelExam = async (exam: HubClinicalExam) => {
    if (!clinicId || !canWrite) return;
    if (!window.confirm(`Cancelar o pedido de exame «${exam.exam_type}»?`)) return;
    try {
      await hubClinicalExamsApi.patch(exam.id, { clinic_id: clinicId, status: 'cancelled' });
      showSuccess('Exame cancelado');
      void load();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao cancelar exame');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para casos clínicos.</p>;
  }

  if (loading) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Carregando caso clínico…</p>;
  }

  if (!clinicalCase || !caseId || !clinicId) {
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
                <>
                  {canWrite && (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => setEditingStatus(true)}
                    >
                      Alterar status
                    </button>
                  )}
                  {/* Checkout de fim de atendimento removido — use o Caixa (Atendimentos do dia). */}
                </>
              </>
            )}
          </div>
        </div>

        {canWrite && (
          <div className="hub-clinic-case-page__actions">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
              onClick={() => {
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
          { id: 'resumo', label: 'Resumo' },
          { id: 'timeline', label: 'Linha do tempo' },
          { id: 'atendimentos', label: `Atendimentos (${encounters.length})` },
          { id: 'prescricoes', label: `Prescrições (${prescriptions.length})` },
          { id: 'vacinas', label: `Vacinas (${vaccinations.length})` },
          { id: 'internacoes', label: `Internações (${hospitalizations.length})` },
          { id: 'cirurgias', label: `Cirurgias (${surgeries.length})` },
          { id: 'exames', label: `Exames (${exams.length})` },
          { id: 'anexos', label: `Anexos (${attachments.length})` },
          { id: 'financeiro', label: `Financeiro (${comandas.length})` },
        ]}
      />

      {tab === 'resumo' && (
        <div className="hub-clinic-records__list hub-clinic-case-page__resumo">
          {clinicalCase.summary ? (
            <section>
              <h2 className="hub-clinic-page__title" style={{ fontSize: '1.1rem' }}>
                Resumo clínico
              </h2>
              <p>{clinicalCase.summary}</p>
            </section>
          ) : (
            <p className="hub-clientes__muted">Nenhum resumo textual cadastrado para este caso.</p>
          )}
          <section style={{ marginTop: 16 }}>
            <p>
              <strong>Pet:</strong>{' '}
              <Link to={`/hub/clinica/prontuarios?petId=${clinicalCase.pet_id}`} className="hub-clientes__link">
                {clinicalCase.pet?.name ?? clinicalCase.pet_id}
              </Link>
            </p>
            <p>
              <strong>Aberto em:</strong> {new Date(clinicalCase.opened_at).toLocaleDateString('pt-BR')}
            </p>
            {clinicalCase.closed_at ? (
              <p>
                <strong>Fechado em:</strong> {new Date(clinicalCase.closed_at).toLocaleDateString('pt-BR')}
              </p>
            ) : null}
            {clinicalCase.primary_veterinarian ? (
              <p>
                <strong>Veterinário:</strong> {clinicalCase.primary_veterinarian.full_name}
              </p>
            ) : null}
          </section>
          {clinicalCase.tags.length > 0 ? (
            <section style={{ marginTop: 16 }}>
              <strong>Tags</strong>
              <div className="hub-clinic-case-page__tags" style={{ marginTop: 8 }}>
                {clinicalCase.tags.map((tag) => (
                  <span key={tag} className="hub-clinic-alert-chip">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

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
                <div>
                  <Link to={`/hub/clinica/atendimentos/${e.id}`} className="hub-clientes__link">
                    Abrir atendimento →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'prescricoes' && (
        <ul className="hub-clinic-records__list">
          {prescriptions.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma prescrição vinculada a este caso.</li>
          ) : (
            prescriptions.map((p) => <li key={p.id}>{formatPrescriptionLine(p)}</li>)
          )}
        </ul>
      )}

      {tab === 'vacinas' && (
        <ul className="hub-clinic-records__list">
          {vaccinations.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma vacina vinculada a este caso.</li>
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

      {tab === 'internacoes' && (
        <ul className="hub-clinic-records__list">
          {hospitalizations.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma internação vinculada a este caso.</li>
          ) : (
            hospitalizations.map((h) => (
              <li key={h.id}>
                {HOSP_STATUS_LABELS[h.status] ?? h.status}
                {h.hub_hospital_beds ? ` · Leito ${h.hub_hospital_beds.code}` : ''}
                {h.admitted_at ? ` · Entrada ${String(h.admitted_at).slice(0, 10)}` : ''}
                {h.discharged_at ? ` · Alta ${String(h.discharged_at).slice(0, 10)}` : ''}
              </li>
            ))
          )}
        </ul>
      )}

      {tab === 'cirurgias' && (
        <ul className="hub-clinic-records__list">
          {surgeries.length === 0 ? (
            <li className="hub-clientes__muted">Nenhuma cirurgia vinculada a este caso.</li>
          ) : (
            surgeries.map((s) => (
              <li key={s.id}>
                {s.title} — {SURGERY_STATUS_LABELS[s.status] ?? s.status}
                {s.scheduled_at ? ` · ${new Date(s.scheduled_at).toLocaleString('pt-BR')}` : ''}
              </li>
            ))
          )}
        </ul>
      )}

      {tab === 'exames' && (
        <div className="hub-clinic-records__list">
          {exams.length === 0 ? (
            <p className="hub-clientes__muted">Nenhum exame estruturado neste caso. Solicite no atendimento.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {exams.map((ex) => (
                <li key={ex.id} className="hub-clinic-timeline__item" style={{ marginBottom: 12 }}>
                  <strong>{ex.exam_type}</strong>
                  <span className="hub-clientes__muted" style={{ marginLeft: 8 }}>
                    {formatHubClinicalExamStatus(ex.status)}
                  </span>
                  <div className="hub-clientes__muted" style={{ fontSize: '0.85rem' }}>
                    Solicitado em {new Date(ex.requested_at).toLocaleString('pt-BR')}
                    {ex.hub_encounter_id ? (
                      <>
                        {' · '}
                        <Link to={`/hub/clinica/atendimentos/${ex.hub_encounter_id}`} className="hub-clientes__link">
                          Ver atendimento
                        </Link>
                      </>
                    ) : null}
                  </div>
                  {ex.result_text ? <p>{ex.result_text}</p> : null}
                  {ex.external_result_url ? (
                    <p>
                      <a href={ex.external_result_url} target="_blank" rel="noreferrer" className="hub-clientes__link">
                        Abrir resultado (link)
                      </a>
                    </p>
                  ) : null}
                  {canWrite && ex.status !== 'cancelled' && ex.status !== 'completed' ? (
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => void cancelExam(ex)}
                    >
                      Cancelar pedido
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'anexos' && (
        <ul className="hub-clinic-records__list">
          {attachments.length === 0 ? (
            <li className="hub-clientes__muted">Nenhum anexo dos atendimentos deste caso.</li>
          ) : (
            attachments.map((a) => (
              <li key={a.id}>
                <a href={attachmentPublicUrl(a.storage_path)} target="_blank" rel="noreferrer" className="hub-clientes__link">
                  {a.title || a.file_name}
                </a>
                {a.uploaded_at ? (
                  <span className="hub-clientes__muted" style={{ marginLeft: 8 }}>
                    {String(a.uploaded_at).slice(0, 10)}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      )}

      {tab === 'financeiro' && (
        <div className="hub-clinic-records__list">
          {!canFinancial ? (
            <p className="hub-clientes__muted">Sem permissão para visualizar comandas deste caso.</p>
          ) : comandas.length === 0 ? (
            <p className="hub-clientes__muted">Nenhuma comanda registrada para este caso.</p>
          ) : (
            <table className="hub-clinic-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Aberta em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comandas.map((c) => (
                  <tr key={String(c.id)}>
                    <td>{formatHubComandaStatus(String(c.status ?? ''))}</td>
                    <td>
                      {typeof c.total_amount === 'number'
                        ? c.total_amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                    <td>{c.opened_at ? new Date(String(c.opened_at)).toLocaleString('pt-BR') : '—'}</td>
                    <td>
                      <Link to="/hub/caixa" className="hub-clientes__link">
                        Caixa
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Checkout centralizado no Caixa — removido daqui */}
    </div>
  );
};

export default HubClinicCasePage;
