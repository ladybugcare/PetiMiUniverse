import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, FileText, Link2, Play, Scissors } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import {
  hubClinicalApi,
  hubClinicalExamsApi,
  openBlankPdfPreviewTab,
  openHubClinicalDocumentPdf,
  type HubClinicalDocumentRow,
  type HubSurgery,
} from '../../api/hubClinicalApi';
import { HubSidePanel } from '../../components/HubSidePanel';
import { HubCancelButton } from '../../components/HubCancelButton';
import { HubClinicalDocumentIssuePanel } from '../../components/clinical/HubClinicalDocumentIssuePanel';
import ClinicalCaseLinkFields, {
  type ClinicalCaseLinkValue,
  isCaseLinkResolved,
} from '../../components/clinical/ClinicalCaseLinkFields';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { uniqueExamTypes } from './examOrderOptions';
import { formatHospDateTime, petInitials } from './hospital/hospDisplay';
import SurgCreateForm, { emptySurgCreateDraft, type SurgCreateDraft } from './surgery/SurgCreateForm';
import SurgDetailForm, {
  parseSurgDetail,
  serializeSurgDetail,
  SURG_DETAIL_TABS,
  type SurgDetailDraft,
  type SurgDetailTab,
} from './surgery/SurgDetailForm';

const EXAM_ORDER_DISCLAIMERS = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui guias oficiais de convênios ou laboratórios.',
  'A realização dos exames é de responsabilidade do laboratório indicado e do tutor, conforme orientação veterinária.',
  'Este documento não garante aceitação por convênios ou laboratórios externos.',
];

function examOrderPdfPath(documentId: string, clinicId: string): string {
  const q = new URLSearchParams({ clinic_id: clinicId, document_id: documentId });
  return `/api/hub/clinical/exams/${encodeURIComponent(documentId)}/pdf?${q}`;
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

type DetailPanel = {
  surgery: HubSurgery;
  tab: SurgDetailTab;
};

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
  const { showError, showSuccess } = useAlert();
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
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const emptyCreateDraft = (): SurgCreateDraft => emptySurgCreateDraft(myStaffMember?.id ?? '');
  const [createDraft, setCreateDraft] = useState<SurgCreateDraft>(emptyCreateDraft);
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createCompleted, setCreateCompleted] = useState(false);
  const [examIssueOpen, setExamIssueOpen] = useState(false);
  const [examIssueLoading, setExamIssueLoading] = useState(false);
  const [examIssueError, setExamIssueError] = useState<string | null>(null);
  const [issuedExamDoc, setIssuedExamDoc] = useState<HubClinicalDocumentRow | null>(null);
  const [issuedExamUrl, setIssuedExamUrl] = useState<string | null>(null);
  const [issuedExamHash, setIssuedExamHash] = useState<string | null>(null);
  const [downloadingExamPdf, setDownloadingExamPdf] = useState(false);

  // Detail edit state
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailDraft, setDetailDraft] = useState<SurgDetailDraft | null>(null);
  const [detailExamIssueOpen, setDetailExamIssueOpen] = useState(false);
  const [detailExamIssueLoading, setDetailExamIssueLoading] = useState(false);
  const [detailExamIssueError, setDetailExamIssueError] = useState<string | null>(null);
  const [detailIssuedDoc, setDetailIssuedDoc] = useState<HubClinicalDocumentRow | null>(null);
  const [detailIssuedUrl, setDetailIssuedUrl] = useState<string | null>(null);
  const [detailIssuedHash, setDetailIssuedHash] = useState<string | null>(null);

  // Link-case for orphan surgeries
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
    if (!detail) {
      setDetailDraft(null);
      setDetailExamIssueOpen(false);
      setDetailExamIssueError(null);
      setDetailIssuedDoc(null);
      setDetailIssuedUrl(null);
      setDetailIssuedHash(null);
      return;
    }
    setDetailDraft(parseSurgDetail(detail.surgery));
    setDetailExamIssueOpen(false);
    setDetailExamIssueError(null);
    if (!clinicId || !detail.surgery.hub_encounter_id) {
      setDetailIssuedDoc(null);
      setDetailIssuedUrl(null);
      setDetailIssuedHash(null);
      return;
    }
    void hubClinicalExamsApi
      .listOrderDocumentsByEncounter(detail.surgery.hub_encounter_id, clinicId)
      .then((r) => {
        const doc = (r.documents ?? []).find((d) => d.document_status !== 'revoked') ?? r.documents?.[0] ?? null;
        setDetailIssuedDoc(doc);
        setDetailIssuedUrl(doc?.validation_url ?? doc?.public_url ?? null);
        setDetailIssuedHash(doc?.content_hash_short ?? null);
      })
      .catch(() => {
        setDetailIssuedDoc(null);
        setDetailIssuedUrl(null);
        setDetailIssuedHash(null);
      });
  }, [detail?.surgery.id, clinicId]);

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
    setCreateCompleted(false);
    setExamIssueOpen(false);
    setExamIssueLoading(false);
    setExamIssueError(null);
    setIssuedExamDoc(null);
    setIssuedExamUrl(null);
    setIssuedExamHash(null);
  };

  const closeCreatePanel = () => {
    setCreateOpen(false);
    resetCreateForm();
  };

  const downloadExamPdf = async (documentId: string) => {
    if (!clinicId) return;
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingExamPdf(true);
    try {
      const mode = await openHubClinicalDocumentPdf(
        examOrderPdfPath(documentId, clinicId),
        `solicitacao-exames-${documentId.slice(0, 8)}.pdf`,
        pdfPreviewWindow,
      );
      if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    } finally {
      setDownloadingExamPdf(false);
    }
  };

  const create = async () => {
    if (!clinicId || !createDraft.guardianId || !createDraft.petId || !createDraft.title.trim() || !createDraft.scheduledAt) {
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
    const preOp: Record<string, unknown> = {};
    if (createDraft.notes.trim()) preOp.notes = createDraft.notes.trim();
    if (examTypes.length) {
      preOp.exam_types = examTypes;
      preOp.lab_kind = createDraft.labKind;
      if (createDraft.labName.trim()) preOp.lab_name = createDraft.labName.trim();
      preOp.fasting_required = createDraft.fastingRequired;
      if (createDraft.examIndication.trim()) preOp.exam_indication = createDraft.examIndication.trim();
    }
    const pdfPreviewWindow = examTypes.length ? openBlankPdfPreviewTab() : null;
    setSubmitting(true);
    try {
      const { surgery } = await hubClinicalApi.createSurgery({
        clinic_id: clinicId,
        pet_id: createDraft.petId,
        title,
        scheduled_at: new Date(createDraft.scheduledAt).toISOString(),
        anesthetic_risk: createDraft.asaRisk || null,
        pre_op: preOp,
        hub_staff_member_id: createDraft.staffId || null,
        guardian_id: createDraft.guardianId || null,
        unit_id: getSelectedUnitId(),
        ...caseLink,
      });
      await reload();

      if (!examTypes.length) {
        pdfPreviewWindow?.close();
        closeCreatePanel();
        showSuccess('Cirurgia agendada');
        return;
      }

      const shared = {
        clinic_id: clinicId,
        pet_id: createDraft.petId,
        hub_case_id: surgery.hub_case_id ?? null,
        hub_encounter_id: surgery.hub_encounter_id ?? null,
        guardian_id: createDraft.guardianId || null,
        lab_kind: createDraft.labKind,
        lab_name: createDraft.labKind === 'internal' ? createDraft.labName.trim() || null : null,
        external_lab_name: createDraft.labKind === 'external' ? createDraft.labName.trim() || null : null,
        clinical_indication: createDraft.examIndication.trim() || `Pré-operatório — ${title}`,
        fasting_required: createDraft.fastingRequired,
        requested_by: createDraft.staffId || null,
      };
      try {
        for (const exam_type of examTypes) {
          await hubClinicalExamsApi.create({ ...shared, exam_type });
        }
      } catch (e: unknown) {
        pdfPreviewWindow?.close();
        setCreateCompleted(true);
        showError(`Cirurgia agendada, mas os exames não foram solicitados: ${(e as Error)?.message || 'Erro ao solicitar exames'}`);
        return;
      }

      setCreateCompleted(true);
      showSuccess('Cirurgia agendada e exames solicitados — o PDF fica disponível neste painel');

      const encounterId = surgery.hub_encounter_id;
      if (!encounterId) {
        pdfPreviewWindow?.close();
        showError('Exames criados, mas sem atendimento para emitir o PDF. Abra o caso para gerar a solicitação.');
        return;
      }

      setExamIssueOpen(true);
      setExamIssueLoading(true);
      setExamIssueError(null);
      try {
        const res = await hubClinicalExamsApi.issueOrderDocument({
          clinic_id: clinicId,
          hub_encounter_id: encounterId,
          scope: 'encounter_bundle',
          issued_by: createDraft.staffId || null,
        });
        setIssuedExamDoc(res.document);
        setIssuedExamUrl(res.public_url ?? res.document.public_url ?? res.document.validation_url ?? null);
        setIssuedExamHash(res.content_hash_short ?? res.document.content_hash_short ?? null);
        try {
          const mode = await openHubClinicalDocumentPdf(
            examOrderPdfPath(res.document.id, clinicId),
            `solicitacao-exames-${res.document.id.slice(0, 8)}.pdf`,
            pdfPreviewWindow,
          );
          if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
        } catch (pdfErr: unknown) {
          pdfPreviewWindow?.close();
          showError((pdfErr as Error)?.message || 'Documento emitido, mas não foi possível abrir o PDF.');
        }
      } catch (e: unknown) {
        pdfPreviewWindow?.close();
        const message = (e as Error)?.message || 'Erro ao emitir solicitação de exames';
        setExamIssueError(message);
        showError(message);
      } finally {
        setExamIssueLoading(false);
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
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

  const saveDetail = async () => {
    if (!detail || !clinicId || !detailDraft) return;
    setDetailSaving(true);
    try {
      const payload = serializeSurgDetail(detailDraft);
      const res = (await hubClinicalApi.patchSurgery(detail.surgery.id, {
        clinic_id: clinicId,
        ...payload,
      })) as { surgery?: HubSurgery };
      if (res.surgery) {
        setDetail((d) => (d ? { ...d, surgery: res.surgery! } : d));
        setDetailDraft(parseSurgDetail(res.surgery));
      }
      await reload();
      showSuccess('Cirurgia atualizada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar');
    } finally {
      setDetailSaving(false);
    }
  };

  const issueDetailExamPdf = async () => {
    if (!clinicId || !detail || !detailDraft) return;
    const examTypes = uniqueExamTypes(detailDraft.preOp.examTypes);
    if (!examTypes.length) {
      showError('Selecione ao menos um exame para emitir a solicitação.');
      return;
    }
    const encounterId = detail.surgery.hub_encounter_id;
    if (!encounterId) {
      showError('Esta cirurgia ainda não tem atendimento para emitir o PDF.');
      return;
    }
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDetailExamIssueOpen(true);
    setDetailExamIssueLoading(true);
    setDetailExamIssueError(null);
    try {
      const existing = await hubClinicalExamsApi.list(clinicId, { encounterId });
      const have = new Set((existing.exams ?? []).map((e) => e.exam_type));
      const shared = {
        clinic_id: clinicId,
        pet_id: detail.surgery.pet_id,
        hub_case_id: detail.surgery.hub_case_id ?? null,
        hub_encounter_id: encounterId,
        guardian_id: detail.surgery.guardian_id ?? null,
        lab_kind: detailDraft.preOp.labKind,
        lab_name: detailDraft.preOp.labKind === 'internal' ? detailDraft.preOp.labName.trim() || null : null,
        external_lab_name: detailDraft.preOp.labKind === 'external' ? detailDraft.preOp.labName.trim() || null : null,
        clinical_indication: detailDraft.preOp.examIndication.trim() || `Pré-operatório — ${detail.surgery.title}`,
        fasting_required: detailDraft.preOp.fastingRequired,
        requested_by: detail.surgery.hub_staff_member_id ?? null,
      };
      for (const exam_type of examTypes) {
        if (!have.has(exam_type)) {
          await hubClinicalExamsApi.create({ ...shared, exam_type });
        }
      }
      const res = await hubClinicalExamsApi.issueOrderDocument({
        clinic_id: clinicId,
        hub_encounter_id: encounterId,
        scope: 'encounter_bundle',
        issued_by: detail.surgery.hub_staff_member_id ?? null,
      });
      setDetailIssuedDoc(res.document);
      setDetailIssuedUrl(res.public_url ?? res.document.public_url ?? res.document.validation_url ?? null);
      setDetailIssuedHash(res.content_hash_short ?? res.document.content_hash_short ?? null);
      try {
        const mode = await openHubClinicalDocumentPdf(
          examOrderPdfPath(res.document.id, clinicId),
          `solicitacao-exames-${res.document.id.slice(0, 8)}.pdf`,
          pdfPreviewWindow,
        );
        if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
      } catch (pdfErr: unknown) {
        pdfPreviewWindow?.close();
        showError((pdfErr as Error)?.message || 'Documento emitido, mas não foi possível abrir o PDF.');
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      const message = (e as Error)?.message || 'Erro ao emitir solicitação de exames';
      setDetailExamIssueError(message);
      showError(message);
    } finally {
      setDetailExamIssueLoading(false);
    }
  };

  const confirmLinkCase = async () => {
    if (!clinicId || !linkCaseSurg) return;
    if (!isCaseLinkResolved(linkCaseValue, linkCaseHasActive)) {
      showError('Selecione um caso clínico ou escolha criar um novo.');
      return;
    }
    setLinkCaseSubmitting(true);
    try {
      await hubClinicalApi.patchSurgery(linkCaseSurg.id, {
        clinic_id: clinicId,
        ...linkCaseValue,
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

  const openDetail = (surgery: HubSurgery) => {
    setDetail({ surgery, tab: 'pre_op' });
  };

  const canSubmitCreate =
    !createCompleted &&
    !!createDraft.guardianId &&
    !!createDraft.petId &&
    !!createDraft.title.trim() &&
    !!createDraft.scheduledAt &&
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
                    onClick={() => openDetail(s)}
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
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                    </td>
                    <td>
                      {s.hub_case_id ? (
                        <span className="hub-clientes__pill hub-dayboard__pill--open">Vinculado</span>
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
                          onClick={() => openDetail(s)}
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
                            onClick={() => void patchStatus(s.id, 'in_progress')}
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

      {/* Painel de criação */}
      <HubSidePanel
        open={createOpen}
        onClose={closeCreatePanel}
        title="Nova cirurgia"
        titleIcon={<Scissors size={22} strokeWidth={2} aria-hidden />}
        size="wide"
        footer={
          <div className="hub-clientes__panel-footer">
            {createCompleted ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                onClick={closeCreatePanel}
              >
                Concluir
              </button>
            ) : (
              <>
                <HubCancelButton onClick={closeCreatePanel} />
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary"
                  disabled={!canSubmitCreate}
                  onClick={() => void create()}
                >
                  {submitting ? 'Salvando…' : 'Agendar cirurgia'}
                </button>
              </>
            )}
          </div>
        }
      >
        {clinicId ? (
          createCompleted && examIssueOpen ? (
            <HubClinicalDocumentIssuePanel
              embedded
              open
              onClose={closeCreatePanel}
              loading={examIssueLoading}
              error={examIssueError}
              document={issuedExamDoc}
              publicUrl={issuedExamUrl}
              contentHashShort={issuedExamHash}
              titleLoading="Gerando solicitação de exames validável…"
              titleReady="Solicitação de exames emitida"
              subtitleLoading="Aguarde enquanto preparamos o PDF, o link e o código de validação."
              disclaimers={EXAM_ORDER_DISCLAIMERS}
              downloading={downloadingExamPdf}
              onDownloadPdf={issuedExamDoc ? () => void downloadExamPdf(issuedExamDoc.id) : undefined}
              onCopySuccess={showSuccess}
              onCopyError={showError}
            />
          ) : (
            <>
              {createCompleted ? (
                <p className="nam-muted" role="status">
                  Cirurgia agendada.
                </p>
              ) : null}
              <SurgCreateForm
                clinicId={clinicId}
                open={createOpen}
                staff={staffList}
                draft={createDraft}
                onChange={setCreateDraft}
                onHasActiveCases={setHasActiveCases}
                submitting={submitting || createCompleted}
              />
            </>
          )
        ) : (
          <p className="hub-clientes__muted">Selecione uma clínica para agendar a cirurgia.</p>
        )}
      </HubSidePanel>

      {/* Painel de vincular caso (órfão) */}
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
              onChange={(v) => {
                setLinkCaseValue(v);
                setLinkCaseHasActive(true);
              }}
              disabled={linkCaseSubmitting}
              suggestedTitle={linkCaseSurg.title}
              emptyActiveHint="Nenhum caso ativo — um novo caso será criado para esta cirurgia."
              blankTitleHint="Se ficar em branco, usamos o nome do procedimento."
              tone="agenda"
            />
          )}
        </div>
      </HubSidePanel>

      {/* Painel de detalhes */}
      <HubSidePanel
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.surgery.title ?? 'Cirurgia'}
        titleIcon={<Scissors size={22} strokeWidth={2} aria-hidden />}
        size="wide"
        footer={
          canWrite ? (
            <div className="hub-clientes__panel-footer">
              <HubCancelButton onClick={() => setDetail(null)} />
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={detailSaving || !detailDraft}
                onClick={() => void saveDetail()}
              >
                {detailSaving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          ) : null
        }
      >
        {detail && detailDraft ? (
          <div className="hub-hosp-admit">
            <p className="nam-muted">
              {[
                detail.surgery.hub_pets?.name,
                detail.surgery.hub_guardians?.full_name,
                formatHospDateTime(detail.surgery.scheduled_at),
                STATUS_LABEL[detail.surgery.status] || detail.surgery.status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {detail.surgery.hub_case_id ? (
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--ghost"
                onClick={() => navigate(`/hub/clinica/casos/${detail.surgery.hub_case_id}`)}
              >
                <FileText size={15} strokeWidth={2} /> Ver caso clínico
              </button>
            ) : null}
            <div className="hub-hosp-admit__seg hub-hosp-admit__seg--tabs" role="tablist" aria-label="Seções da cirurgia">
              {SURG_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={detail.tab === tab.id}
                  className={detail.tab === tab.id ? 'is-on' : undefined}
                  onClick={() => setDetail((d) => (d ? { ...d, tab: tab.id } : d))}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {detailExamIssueOpen ? (
              <HubClinicalDocumentIssuePanel
                embedded
                open
                onClose={() => setDetailExamIssueOpen(false)}
                loading={detailExamIssueLoading}
                error={detailExamIssueError}
                document={detailIssuedDoc}
                publicUrl={detailIssuedUrl}
                contentHashShort={detailIssuedHash}
                titleLoading="Gerando solicitação de exames validável…"
                titleReady="Solicitação de exames emitida"
                subtitleLoading="Aguarde enquanto preparamos o PDF, o link e o código de validação."
                disclaimers={EXAM_ORDER_DISCLAIMERS}
                downloading={downloadingExamPdf}
                onDownloadPdf={detailIssuedDoc ? () => void downloadExamPdf(detailIssuedDoc.id) : undefined}
                onCopySuccess={showSuccess}
                onCopyError={showError}
              />
            ) : null}
            <SurgDetailForm
              tab={detail.tab}
              draft={detailDraft}
              staff={staffList}
              canWrite={canWrite}
              onChange={setDetailDraft}
              issuingExamPdf={detailExamIssueLoading}
              hasExamDocument={!!detailIssuedDoc}
              onIssueExamPdf={
                clinicId
                  ? () => {
                      if (detailIssuedDoc) {
                        setDetailExamIssueOpen(true);
                        void downloadExamPdf(detailIssuedDoc.id);
                        return;
                      }
                      void issueDetailExamPdf();
                    }
                  : undefined
              }
            />
            {canWrite &&
            detail.tab === 'post_op' &&
            (detail.surgery.status === 'in_progress' || detail.surgery.status === 'completed') ? (
              <Link
                to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(detail.surgery.pet_id)}${detail.surgery.hub_case_id ? `&hub_case_id=${encodeURIComponent(detail.surgery.hub_case_id)}` : ''}`}
                className="hub-clientes__btn hub-clientes__btn--ghost"
              >
                Internar pós-operatório
              </Link>
            ) : null}
          </div>
        ) : null}
      </HubSidePanel>
    </div>
  );
};

export default HubClinicSurgeriesPage;
