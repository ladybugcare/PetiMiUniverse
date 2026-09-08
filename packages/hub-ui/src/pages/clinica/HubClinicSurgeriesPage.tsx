import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, FileText, Link2, Play, Scissors } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { hubClinicalApi, hubClinicalExamsApi, type HubSurgery } from '../../api/hubClinicalApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
  isCaseLinkResolved,
} from '../../components/clinical/ClinicalCaseLinkFields';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { uniqueExamTypes } from './examOrderOptions';
import { formatHospDateTime, petInitials } from './hospital/hospDisplay';
import SurgCreateForm, { emptySurgCreateDraft, type SurgCreateDraft } from './surgery/SurgCreateForm';
import { futureSurgeryStartCopy, isSurgeryScheduledInFuture, SURGERY_STATUS_LABEL } from './surgery/surgDisplay';

export type HubClinicSurgeriesPageProps = {
  /** Lista embutida no Consultório (sem botão primário de criação). */
  embedded?: boolean;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  presetPetId?: string | null;
  presetCaseId?: string | null;
};

const HubClinicSurgeriesPage: React.FC<HubClinicSurgeriesPageProps> = ({
  embedded = false,
  createOpen: createOpenProp,
  onCreateOpenChange,
  presetPetId,
  presetCaseId,
}) => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const { showAlert, showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const { myStaffMember, staffList } = useMyStaffMember();
  const [searchParams] = useSearchParams();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const [rows, setRows] = useState<HubSurgery[]>([]);
  const [createOpenInternal, setCreateOpenInternal] = useState(false);
  const createControlled = createOpenProp !== undefined;
  const createOpen = createControlled ? Boolean(createOpenProp) : createOpenInternal;
  const setCreateOpen = (open: boolean) => {
    onCreateOpenChange?.(open);
    if (!createControlled) setCreateOpenInternal(open);
  };
  const emptyCreateDraft = (): SurgCreateDraft => emptySurgCreateDraft(myStaffMember?.id ?? '');
  const [createDraft, setCreateDraft] = useState<SurgCreateDraft>(emptyCreateDraft);
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [linkCaseSurg, setLinkCaseSurg] = useState<HubSurgery | null>(null);
  const [linkCaseValue, setLinkCaseValue] = useState<ClinicalCaseLinkValue>({});
  const [linkCaseHasActive, setLinkCaseHasActive] = useState(false);
  const [linkCaseSubmitting, setLinkCaseSubmitting] = useState(false);

  const reload = () => {
    if (!clinicId) return Promise.resolve();
    return hubClinicalApi.listSurgeries(clinicId).then((r) => setRows(r.surgeries ?? []));
  };

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void reload().catch(() => setRows([]));
  }, [clinicId, canRead]);

  useEffect(() => {
    if (!createOpen) return;
    setCreateDraft((prev) => ({
      ...prev,
      petId: presetPetId || prev.petId,
      caseLink: presetCaseId ? { hub_case_id: presetCaseId } : prev.caseLink,
      staffId: prev.staffId || myStaffMember?.id || '',
    }));
  }, [presetPetId, presetCaseId, createOpen, myStaffMember?.id]);

  useEffect(() => {
    if (embedded) return;
    const qPet = searchParams.get('pet_id');
    const qCase = searchParams.get('hub_case_id');
    if (!qPet && !qCase) return;
    setCreateOpen(true);
    setCreateDraft((prev) => ({
      ...prev,
      petId: qPet || prev.petId,
      caseLink: qCase ? { hub_case_id: qCase } : prev.caseLink,
    }));
  }, []);

  const resetCreateForm = () => {
    setCreateDraft(emptyCreateDraft());
    setHasActiveCases(false);
  };

  const closeCreatePanel = () => {
    setCreateOpen(false);
    resetCreateForm();
  };

  const openSurgery = (id: string, opts?: { focusExams?: boolean }) => {
    const q = opts?.focusExams ? '?exames=1' : '';
    navigate(`/hub/clinica/cirurgias/${id}${q}`);
  };

  const create = async () => {
    if (
      !clinicId ||
      !createDraft.guardianId ||
      !createDraft.petId ||
      !createDraft.title.trim() ||
      !createDraft.scheduledDate ||
      !createDraft.scheduledTime
    ) {
      return;
    }
    if (!isCaseLinkResolved(createDraft.caseLink, hasActiveCases)) {
      showError('Selecione um caso clínico ou escolha criar um novo antes de continuar.');
      return;
    }
    const title = createDraft.title.trim();
    const examTypes = uniqueExamTypes(createDraft.examTypes);
    const caseLink = createDraft.caseLink.create_new_case
      ? {
          ...createDraft.caseLink,
          new_case_title: createDraft.caseLink.new_case_title?.trim() || title,
        }
      : createDraft.caseLink;
    // Exames viram registros do atendimento; aqui o pré-op guarda só as observações da cirurgia.
    const preOp: Record<string, unknown> = {};
    if (createDraft.notes.trim()) preOp.notes = createDraft.notes.trim();
    setSubmitting(true);
    try {
      const { surgery } = await hubClinicalApi.createSurgery({
        clinic_id: clinicId,
        pet_id: createDraft.petId,
        title,
        scheduled_at: new Date(`${createDraft.scheduledDate}T${createDraft.scheduledTime}`).toISOString(),
        anesthetic_risk: createDraft.asaRisk || null,
        pre_op: preOp,
        hub_staff_member_id: createDraft.staffId || myStaffMember?.id || null,
        guardian_id: createDraft.guardianId || null,
        unit_id: getSelectedUnitId(),
        services: createDraft.servicePick.hub_service_type_id
          ? [
              {
                hub_service_type_id: createDraft.servicePick.hub_service_type_id,
                unit_amount: createDraft.servicePick.unit_amount
                  ? Number(createDraft.servicePick.unit_amount.replace(',', '.'))
                  : null,
              },
            ]
          : [],
        ...caseLink,
      });

      let examError: string | null = null;
      if (examTypes.length && surgery.hub_encounter_id) {
        const shared = {
          clinic_id: clinicId,
          pet_id: createDraft.petId,
          hub_case_id: surgery.hub_case_id ?? null,
          hub_encounter_id: surgery.hub_encounter_id,
          guardian_id: createDraft.guardianId || null,
          lab_kind: createDraft.labKind,
          lab_name: createDraft.labKind === 'internal' ? createDraft.labName.trim() || null : null,
          external_lab_name: createDraft.labKind === 'external' ? createDraft.labName.trim() || null : null,
          clinical_indication: createDraft.examIndication.trim() || `Pré-operatório — ${title}`,
          fasting_required: createDraft.fastingRequired,
          requested_by: createDraft.staffId || myStaffMember?.id || null,
        };
        try {
          for (const exam_type of examTypes) {
            await hubClinicalExamsApi.create({ ...shared, exam_type });
          }
        } catch (e: unknown) {
          examError = (e as Error)?.message || 'Erro ao solicitar exames';
        }
      }

      closeCreatePanel();
      if (examError) {
        showError(`Cirurgia agendada, mas os exames não foram solicitados: ${examError}`);
        openSurgery(surgery.id, { focusExams: true });
        return;
      }
      showSuccess(
        examTypes.length
          ? 'Cirurgia agendada — exames solicitados, gere o PDF na ficha'
          : 'Cirurgia agendada',
      );
      openSurgery(surgery.id, { focusExams: examTypes.length > 0 });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar cirurgia');
    } finally {
      setSubmitting(false);
    }
  };

  const patchStatus = async (id: string, status: string, row?: HubSurgery) => {
    if (!clinicId) return;
    const movedAgenda = status === 'in_progress' && row && isSurgeryScheduledInFuture(row);
    try {
      await hubClinicalApi.patchSurgery(id, {
        clinic_id: clinicId,
        status,
        ...(status === 'in_progress'
          ? { started_at: new Date().toISOString(), hub_staff_member_id: myStaffMember?.id || row?.hub_staff_member_id || null }
          : {}),
      });
      await reload();
      if (status === 'in_progress') {
        showSuccess(
          movedAgenda
            ? 'Cirurgia iniciada — o horário na agenda foi atualizado e o pet entrou na sua fila'
            : 'Cirurgia iniciada',
        );
      }
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar cirurgia');
    }
  };

  const confirmStartSurgery = (row: HubSurgery) => {
    if (isSurgeryScheduledInFuture(row)) {
      const copy = futureSurgeryStartCopy(formatHospDateTime(row.scheduled_at));
      showAlert({
        type: 'warning',
        title: copy.title,
        message: copy.message,
        showCancel: true,
        confirmText: 'Iniciar agora',
        cancelText: 'Manter na data',
        onConfirm: () => {
          void patchStatus(row.id, 'in_progress', row);
        },
      });
      return;
    }
    void patchStatus(row.id, 'in_progress', row);
  };

  const confirmLinkCase = async () => {
    if (!clinicId || !linkCaseSurg) return;
    if (!isCaseLinkResolved(linkCaseValue, linkCaseHasActive)) {
      showError('Selecione um caso clínico ou escolha criar um novo.');
      return;
    }
    setLinkCaseSubmitting(true);
    try {
      const caseLink = linkCaseValue.create_new_case
        ? {
            create_new_case: true as const,
            new_case_title:
              linkCaseValue.new_case_title?.trim() || linkCaseSurg.title || null,
          }
        : linkCaseValue;
      await hubClinicalApi.patchSurgery(linkCaseSurg.id, {
        clinic_id: clinicId,
        ...caseLink,
      });
      setLinkCaseSurg(null);
      setLinkCaseValue({});
      await reload();
      showSuccess('Cirurgia vinculada ao caso');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao vincular caso');
    } finally {
      setLinkCaseSubmitting(false);
    }
  };

  const canSubmitCreate =
    !!createDraft.guardianId &&
    !!createDraft.petId &&
    !!createDraft.title.trim() &&
    !!createDraft.scheduledDate &&
    !!createDraft.scheduledTime &&
    !submitting &&
    isCaseLinkResolved(createDraft.caseLink, hasActiveCases);

  const visibleRows = useMemo(() => {
    if (!embedded) return rows;
    return rows.filter((s) => s.status === 'scheduled' || s.status === 'in_progress');
  }, [rows, embedded]);

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão.</p>;
  }

  return (
    <div className={`hub-clinic-surgeries${embedded ? ' hub-clinic-surgeries--embedded' : ''}`}>
      {canWrite && !embedded && (
        <div className="hub-clientes__toolbar">
          <button type="button" className="hub-clientes__btn hub-clientes__btn--primary" onClick={() => setCreateOpen(true)}>
            Nova cirurgia
          </button>
        </div>
      )}

      {!embedded ? <h3 className="hub-clinic-section-title">Cirurgias</h3> : null}
      {visibleRows.length === 0 ? (
        <div className="hub-dayboard__empty">
          {embedded ? 'Nenhuma cirurgia em andamento ou agendada.' : 'Nenhuma cirurgia registrada.'}
        </div>
      ) : (
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table hub-dayboard__table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Tutor</th>
                <th>Agendada</th>
                <th>ASA</th>
                <th>Status</th>
                <th>Caso</th>
                <th className="hub-clientes__th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((s) => {
                const petName = s.hub_pets?.name || 'Pet';
                const tutor = s.hub_guardians?.full_name;
                return (
                  <tr
                    key={s.id}
                    className="hub-dayboard__row-click"
                    onClick={() => openSurgery(s.id)}
                  >
                    <td>
                      <div className="hub-clientes__tutor-cell">
                        <span className="hub-clientes__avatar">{petInitials(petName)}</span>
                        <span>
                          <span className="hub-clientes__tutor-name hub-dayboard__pet-name">{petName}</span>
                          {s.title ? <small className="hub-hosp-admit__row-reason">{s.title}</small> : null}
                        </span>
                      </div>
                    </td>
                    <td>{tutor || <span className="hub-clientes__muted">—</span>}</td>
                    <td className="hub-dayboard__time-cell">{formatHospDateTime(s.scheduled_at)}</td>
                    <td>{s.anesthetic_risk ? `ASA ${s.anesthetic_risk}` : <span className="hub-clientes__muted">—</span>}</td>
                    <td>
                      <span className={`hub-dayboard__op-badge hub-dayboard__op-badge--${s.status}`}>
                        {SURGERY_STATUS_LABEL[s.status] || s.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {s.hub_case_id ? (
                        <button
                          type="button"
                          className="hub-clientes__pill hub-dayboard__pill--open hub-dayboard__pill--link"
                          title="Abrir caso clínico"
                          onClick={() => navigate(`/hub/clinica/casos/${s.hub_case_id}`)}
                        >
                          {s.hub_clinical_cases?.title?.trim() || 'Vinculado'}
                        </button>
                      ) : (
                        <span className="hub-clientes__pill hub-dayboard__pill--none">Sem caso</span>
                      )}
                    </td>
                    <td className="hub-clientes__td-actions" onClick={(e) => e.stopPropagation()}>
                      <div className="hub-clientes__td-actions-inner hub-dayboard__actions">
                        <button
                          type="button"
                          className="hub-dayboard__action-btn"
                          title="Abrir cirurgia"
                          aria-label="Abrir cirurgia"
                          onClick={() => openSurgery(s.id)}
                        >
                          <Scissors size={15} strokeWidth={2} />
                        </button>
                        {s.hub_case_id ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Ver caso"
                            aria-label="Ver caso"
                            onClick={() => navigate(`/hub/clinica/casos/${s.hub_case_id}`)}
                          >
                            <FileText size={15} strokeWidth={2} />
                          </button>
                        ) : canWrite ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Vincular caso"
                            aria-label="Vincular caso"
                            onClick={() => {
                              setLinkCaseSurg(s);
                              setLinkCaseValue({});
                              setLinkCaseHasActive(false);
                            }}
                          >
                            <Link2 size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                        {canWrite && s.status === 'scheduled' ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Iniciar"
                            aria-label="Iniciar cirurgia"
                            onClick={() => confirmStartSurgery(s)}
                          >
                            <Play size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                        {canWrite && s.status === 'in_progress' ? (
                          <button
                            type="button"
                            className="hub-dayboard__action-btn"
                            title="Concluir"
                            aria-label="Concluir cirurgia"
                            onClick={() => void patchStatus(s.id, 'completed')}
                          >
                            <Check size={15} strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <HubSidePanel
        open={createOpen}
        onClose={closeCreatePanel}
        title="Nova cirurgia"
        titleIcon={<Scissors size={22} strokeWidth={2} aria-hidden />}
        size="wide"
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={closeCreatePanel} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!canSubmitCreate}
              onClick={() => void create()}
            >
              {submitting ? 'Salvando…' : 'Agendar cirurgia'}
            </button>
          </div>
        }
      >
        {clinicId ? (
          <SurgCreateForm
            clinicId={clinicId}
            open={createOpen}
            staff={staffList}
            draft={createDraft}
            onChange={setCreateDraft}
            onHasActiveCases={setHasActiveCases}
            submitting={submitting}
          />
        ) : (
          <p className="hub-clientes__muted">Selecione uma clínica para agendar a cirurgia.</p>
        )}
      </HubSidePanel>

      <HubSidePanel
        open={!!linkCaseSurg}
        onClose={() => { setLinkCaseSurg(null); setLinkCaseValue({}); }}
        title={`Vincular caso — ${linkCaseSurg?.title ?? 'Cirurgia'}`}
        footer={
          <div className="hub-clientes__panel-footer">
            <HubCancelButton onClick={() => { setLinkCaseSurg(null); setLinkCaseValue({}); }} />
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={linkCaseSubmitting || !isCaseLinkResolved(linkCaseValue, linkCaseHasActive)}
              onClick={() => void confirmLinkCase()}
            >
              {linkCaseSubmitting ? 'Salvando…' : 'Vincular'}
            </button>
          </div>
        }
      >
        <div className="hub-clientes__form-stack">
          {clinicId && linkCaseSurg && (
            <ClinicalCaseLinkFields
              clinicId={clinicId}
              petId={linkCaseSurg.pet_id}
              value={linkCaseValue}
              onChange={setLinkCaseValue}
              onHasActiveCases={setLinkCaseHasActive}
              disabled={linkCaseSubmitting}
              suggestedTitle={linkCaseSurg.title}
              emptyActiveHint="Nenhum caso ativo — um novo caso será criado para esta cirurgia."
              blankTitleHint="Se ficar em branco, usamos o nome do procedimento."
              tone="agenda"
            />
          )}
        </div>
      </HubSidePanel>
    </div>
  );
};

export default HubClinicSurgeriesPage;
