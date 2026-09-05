import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import { HubClinicalDocumentIssuePanel } from '../../components/clinical/HubClinicalDocumentIssuePanel';
import { HubPrescriptionRevokeModal } from '../../components/clinical/HubPrescriptionRevokeModal';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';
import {
  hubClinicalApi,
  hubClinicalExamsApi,
  openBlankPdfPreviewTab,
  openHubClinicalDocumentPdf,
  type HubClinicalDocumentRow,
  type HubClinicalExam,
  type HubClinicalExamLabKind,
  type HubEncounter,
  type HubPrescriptionDocumentRow,
} from '../../api/hubClinicalApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';
import { formatHubClinicalExamStatus } from './clinicalDisplay';
import { buildExamOrderWhatsAppMessage, openExamOrderWhatsApp } from './hubExamOrderShareUtils';
import { CareLocationBadge } from '../../components/CareLocationFields';
import { HubMultiSelectCombobox } from '../../components/HubMultiSelectCombobox';
import { HubCwsChoiceChips } from './HubCwsChoiceChips';
import {
  EXAM_LAB_OPTIONS,
  EXAM_TYPE_OPTIONS,
  examTypeLabel,
  uniqueExamTypes,
} from './examOrderOptions';

const EXAM_ORDER_DISCLAIMERS = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui guias oficiais de convênios ou laboratórios.',
  'A realização dos exames é de responsabilidade do laboratório indicado e do tutor, conforme orientação veterinária.',
  'Este documento não garante aceitação por convênios ou laboratórios externos.',
];

type ClinicalDocRow = HubClinicalDocumentRow & { exam_id?: string | null };

function examOrderPdfPath(documentId: string, clinicId: string): string {
  const q = new URLSearchParams({ clinic_id: clinicId, document_id: documentId });
  return `/api/hub/clinical/exams/${encodeURIComponent(documentId)}/pdf?${q}`;
}

function isExamItemEditLocked(readOnly: boolean, exam: HubClinicalExam): boolean {
  return readOnly || exam.document_status === 'issued';
}

function resolveIssueBlockReason(encounter: HubEncounter, exams: HubClinicalExam[]): string | null {
  if (!exams.length) return 'Adicione ao menos um exame antes de gerar o documento.';
  if (!encounter.pet_id) return 'Vincule um pet ao atendimento antes de emitir.';
  if (!encounter.hub_staff_member_id) {
    return 'Defina o veterinário responsável no atendimento antes de emitir.';
  }
  return null;
}

const emptyDraft = () => ({
  exam_types: [] as string[],
  lab_kind: 'internal' as HubClinicalExamLabKind,
  lab_name: '',
  clinical_indication: '',
  fasting_required: false,
  collection_instructions: '',
});

export function HubWorkspaceExamOrders({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
  messageTemplateOverrides,
  hideEmptyState = false,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
  messageTemplateOverrides?: Record<string, string>;
  hideEmptyState?: boolean;
}) {
  const { showError, showSuccess } = useAlert();
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [documents, setDocuments] = useState<ClinicalDocRow[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issuingExamId, setIssuingExamId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuePanelLoading, setIssuePanelLoading] = useState(false);
  const [issuePanelError, setIssuePanelError] = useState<string | null>(null);
  const [issuedDoc, setIssuedDoc] = useState<ClinicalDocRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [issuedHashShort, setIssuedHashShort] = useState<string | null>(null);
  const [revokeDoc, setRevokeDoc] = useState<ClinicalDocRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const reloadExams = useCallback(async () => {
    const r = await hubClinicalExamsApi.list(clinicId, { encounterId: encounter.id });
    setExams(r.exams ?? []);
  }, [clinicId, encounter.id]);

  const reloadDocuments = useCallback(async () => {
    const r = await hubClinicalExamsApi.listOrderDocumentsByEncounter(encounter.id, clinicId);
    setDocuments((r.documents ?? []) as ClinicalDocRow[]);
  }, [clinicId, encounter.id]);

  useEffect(() => {
    void reloadExams().catch(() => setExams([]));
    void reloadDocuments().catch(() => setDocuments([]));
  }, [reloadExams, reloadDocuments]);

  useEffect(() => {
    if (!encounter.guardian_id) {
      setGuardianPhone(null);
      return;
    }
    void hubGuardiansApi
      .getById(encounter.guardian_id, clinicId)
      .then((r) => setGuardianPhone(r.guardian.phone))
      .catch(() => setGuardianPhone(null));
  }, [encounter.guardian_id, clinicId]);

  const issueBlockReason = useMemo(() => resolveIssueBlockReason(encounter, exams), [encounter, exams]);

  const examTypeOptions = useMemo(() => {
    const opts = EXAM_TYPE_OPTIONS.map((o) => ({ value: o.key, label: o.key }));
    for (const cur of draft.exam_types) {
      if (cur && !opts.some((o) => o.value === cur)) {
        opts.push({ value: cur, label: cur });
      }
    }
    return opts;
  }, [draft.exam_types]);

  const openIssuePanel = (doc: ClinicalDocRow, publicUrl?: string | null, hashShort?: string | null) => {
    setIssuePanelError(null);
    setIssuePanelLoading(false);
    setIssuedDoc(doc);
    setIssuedPublicUrl(publicUrl ?? doc.validation_url ?? doc.public_url ?? null);
    setIssuedHashShort(hashShort ?? doc.content_hash_short ?? null);
    setIssuePanelOpen(true);
  };

  const downloadPdf = async (documentId: string) => {
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
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
      setDownloadingPdf(false);
    }
  };

  const shareWhatsApp = (publicLink: string) => {
    const message = buildExamOrderWhatsAppMessage({
      tutorName: encounter.guardian?.full_name,
      petName: encounter.pet?.name,
      publicLink,
      templateOverrides: messageTemplateOverrides,
    });
    const href = openExamOrderWhatsApp(guardianPhone, message);
    if (!href) {
      showError('Cadastre o telefone do tutor para enviar pelo WhatsApp.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
    void logMessageAttempt({
      clinic_id: clinicId,
      unit_id: encounter.unit_id ?? null,
      guardian_id: encounter.guardian_id ?? null,
      pet_id: encounter.pet_id ?? null,
      channel: 'whatsapp_link',
      template_key: 'exam_order_share',
      triggered_by_staff_id: encounter.hub_staff_member_id ?? null,
    });
  };

  const issueDocument = async (scope: 'encounter_bundle' | 'single', examId?: string) => {
    if (issueBlockReason) {
      showError(issueBlockReason);
      return;
    }

    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setIssuePanelError(null);
    setIssuePanelOpen(true);
    setIssuePanelLoading(true);
    setIssuing(true);
    if (examId) setIssuingExamId(examId);

    try {
      const res = await hubClinicalExamsApi.issueOrderDocument({
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        scope,
        exam_id: scope === 'single' ? examId ?? null : null,
        issued_by: encounter.hub_staff_member_id,
      });
      setIssuedDoc(res.document as ClinicalDocRow);
      setIssuedPublicUrl(res.public_url ?? res.document.public_url ?? res.document.validation_url ?? null);
      setIssuedHashShort(res.content_hash_short ?? res.document.content_hash_short ?? null);
      await reloadExams();
      await reloadDocuments();
      showSuccess('Solicitação de exames emitida — PDF e link prontos');
      onClinicalRefresh?.();

      try {
        const mode = await openHubClinicalDocumentPdf(
          examOrderPdfPath(res.document.id, clinicId),
          `solicitacao-exames-${res.document.id.slice(0, 8)}.pdf`,
          pdfPreviewWindow,
        );
        if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
      } catch (pdfErr: unknown) {
        showError((pdfErr as Error)?.message || 'Documento emitido, mas não foi possível abrir o PDF.');
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      const message = (e as Error)?.message || 'Erro ao emitir solicitação de exames';
      setIssuePanelError(message);
      showError(message);
    } finally {
      setIssuePanelLoading(false);
      setIssuing(false);
      setIssuingExamId(null);
    }
  };

  const requestExam = async () => {
    const types = uniqueExamTypes(draft.exam_types);
    if (!types.length || readOnly || requesting) return;
    setRequesting(true);
    try {
      const shared = {
        clinic_id: clinicId,
        pet_id: encounter.pet_id ?? '',
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? null,
        guardian_id: encounter.guardian_id ?? null,
        lab_kind: draft.lab_kind,
        lab_name: draft.lab_kind === 'internal' ? draft.lab_name.trim() || null : null,
        external_lab_name: draft.lab_kind === 'external' ? draft.lab_name.trim() || null : null,
        clinical_indication: draft.clinical_indication.trim() || null,
        fasting_required: draft.fasting_required,
        collection_instructions: draft.collection_instructions.trim() || null,
        requested_by: encounter.hub_staff_member_id ?? null,
      };
      for (const exam_type of types) {
        await hubClinicalExamsApi.create({ ...shared, exam_type });
      }
      setDraft(emptyDraft());
      await reloadExams();
      showSuccess(types.length === 1 ? 'Exame solicitado' : `${types.length} exames solicitados`);
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao solicitar exame');
      await reloadExams().catch(() => undefined);
    } finally {
      setRequesting(false);
    }
  };

  const removeExam = async (exam: HubClinicalExam) => {
    if (isExamItemEditLocked(readOnly, exam)) return;
    try {
      await hubClinicalExamsApi.remove(exam.id, clinicId);
      await reloadExams();
      showSuccess('Exame removido');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover exame');
    }
  };

  const attachResultFile = async (exam: HubClinicalExam, file: File | null) => {
    if (!file || readOnly) return;
    setUploadingId(exam.id);
    try {
      const { attachment } = await hubClinicalApi.uploadAttachmentFile({
        clinicId,
        petId: encounter.pet_id ?? '',
        encounterId: encounter.id,
        examId: exam.id,
        file,
        title: `Resultado: ${exam.exam_type}`,
      });
      const url = attachment.storage_path;
      const isHttp = /^https?:\/\//i.test(url);
      const prevMeta = (exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {}) as Record<
        string,
        unknown
      >;
      await hubClinicalExamsApi.patch(exam.id, {
        clinic_id: clinicId,
        status: 'result_received',
        result_at: new Date().toISOString(),
        result_text: exam.result_text ?? 'Resultado anexado.',
        ...(isHttp ? { external_result_url: url } : {}),
        metadata: {
          ...prevMeta,
          result_attachment_id: attachment.id,
          result_storage_path: url,
        },
      });
      await reloadExams();
      showSuccess('Resultado anexado ao exame');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao anexar resultado');
    } finally {
      setUploadingId(null);
    }
  };

  const confirmRevoke = async (reason: string) => {
    if (!revokeDoc) return;
    setRevoking(true);
    try {
      await hubClinicalExamsApi.revokeOrderDocument(revokeDoc.id, {
        clinic_id: clinicId,
        reason,
        revoked_by: encounter.hub_staff_member_id,
      });
      setRevokeDoc(null);
      await reloadDocuments();
      await reloadExams();
      showSuccess('Documento revogado');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao revogar documento');
    } finally {
      setRevoking(false);
    }
  };

  const labDisplay = (ex: HubClinicalExam) => {
    if (ex.lab_kind === 'external') return ex.external_lab_name || 'Laboratório externo';
    return ex.lab_name || 'Laboratório interno';
  };

  return (
    <>
      <p className="hub-cws-an-block__hint">
        Solicite o exame e emita o PDF com link validável. Depois de emitir, o item trava — gere outra versão se
        precisar mudar.
        {encounter.care_location_kind === 'partner_clinic' ? (
          <>
            {' '}
            <CareLocationBadge
              care_location_kind={encounter.care_location_kind}
              partner_clinic={encounter.partner_clinic}
            />
          </>
        ) : null}
      </p>

      {!readOnly ? (
        <div className="hub-cws-exam-form">
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="exam_types">Exames</label>
            <HubMultiSelectCombobox
              id="exam_types"
              options={examTypeOptions}
              value={draft.exam_types}
              onChange={(next) => setDraft((d) => ({ ...d, exam_types: uniqueExamTypes(next) }))}
              placeholder="Buscar e marcar vários, ou criar outro…"
              searchPlaceholder="Hemograma, T4, ultrassom…"
              allowCreate
              createEntityLabel="opção de exame"
              resolveLabel={examTypeLabel}
              ariaLabel="Exames"
            />
          </div>

          <div className="hub-cws-exam-form__meta">
            <HubCwsChoiceChips
              options={EXAM_LAB_OPTIONS}
              value={draft.lab_kind}
              ariaLabel="Laboratório"
              onChange={(next) => {
                if (!next) return;
                setDraft((d) => ({
                  ...d,
                  lab_kind: next === 'external' ? 'external' : 'internal',
                }));
              }}
            />
            <button
              type="button"
              className={`hub-cws-chip${draft.fasting_required ? ' hub-cws-chip--on hub-cws-chip--warning' : ''}`}
              aria-pressed={draft.fasting_required}
              onClick={() => setDraft((d) => ({ ...d, fasting_required: !d.fasting_required }))}
            >
              Jejum necessário
            </button>
          </div>

          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="exam_lab_name">
                {draft.lab_kind === 'external' ? 'Laboratório externo' : 'Lab interno'}
              </label>
              <input
                id="exam_lab_name"
                value={draft.lab_name}
                onChange={(e) => setDraft((d) => ({ ...d, lab_name: e.target.value }))}
                placeholder={draft.lab_kind === 'external' ? 'Nome do laboratório' : 'Opcional'}
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="exam_indication">Indicação clínica</label>
              <input
                id="exam_indication"
                value={draft.clinical_indication}
                onChange={(e) => setDraft((d) => ({ ...d, clinical_indication: e.target.value }))}
                placeholder="Por que estes exames agora"
              />
            </div>
          </div>

          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="exam_collection">Instruções de coleta</label>
            <input
              id="exam_collection"
              value={draft.collection_instructions}
              onChange={(e) => setDraft((d) => ({ ...d, collection_instructions: e.target.value }))}
              placeholder="Opcional — horário, recipiente, o que o tutor precisa saber"
            />
          </div>

          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={!draft.exam_types.length || requesting}
            onClick={() => void requestExam()}
          >
            {requesting
              ? 'Solicitando…'
              : draft.exam_types.length > 1
                ? `Solicitar ${draft.exam_types.length} exames`
                : 'Solicitar exame'}
          </button>
        </div>
      ) : null}

      {issueBlockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {issueBlockReason}
        </p>
      ) : null}

      {exams.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Exames deste atendimento</strong>
            <div className="hub-rx-panel__actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                disabled={issuing || Boolean(issueBlockReason)}
                title={issueBlockReason ?? undefined}
                onClick={() => void issueDocument('encounter_bundle')}
              >
                {issuing && !issuingExamId
                  ? 'Gerando…'
                  : documents.length
                    ? 'Gerar novo PDF e link validável'
                    : 'Gerar PDF e link validável'}
              </button>
            </div>
          </div>

          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Exame</th>
                  <th>Laboratório</th>
                  <th>Indicação</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {exams.map((ex) => {
                  const locked = isExamItemEditLocked(readOnly, ex);
                  return (
                    <tr key={ex.id}>
                      <td>
                        <strong>{ex.exam_type}</strong>{' '}
                        <CareLocationBadge
                          care_location_kind={ex.care_location_kind}
                          partner_clinic={ex.partner_clinic}
                        />
                        {ex.fasting_required ? (
                          <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                            Jejum necessário
                          </div>
                        ) : null}
                        {ex.collection_instructions ? (
                          <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                            {ex.collection_instructions}
                          </div>
                        ) : null}
                        {ex.document_status === 'issued' ? (
                          <span className="hub-rx-badge hub-rx-badge--issued" style={{ marginTop: 4, display: 'inline-block' }}>
                            Emitido
                          </span>
                        ) : null}
                      </td>
                      <td className="hub-clientes__muted">{labDisplay(ex)}</td>
                      <td className="hub-clientes__muted">{ex.clinical_indication?.trim() || '—'}</td>
                      <td>{formatHubClinicalExamStatus(ex.status)}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                          {ex.document_status !== 'issued' ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--sm"
                              disabled={issuing || Boolean(issueBlockReason)}
                              onClick={() => void issueDocument('single', ex.id)}
                            >
                              {issuingExamId === ex.id ? 'Emitindo…' : 'Emitir só este item'}
                            </button>
                          ) : null}
                          {ex.external_result_url ? (
                            <a href={ex.external_result_url} target="_blank" rel="noreferrer" className="hub-clientes__link">
                              Resultado
                            </a>
                          ) : null}
                          {!readOnly &&
                          (ex.status === 'requested' ||
                            ex.status === 'collected' ||
                            ex.status === 'sent' ||
                            ex.status === 'result_received') ? (
                            <label className="hub-cws-exam-file">
                              <span className="hub-clientes__link" style={{ cursor: 'pointer' }}>
                                Anexar
                              </span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hub-cws-exam-file__input"
                                disabled={uploadingId === ex.id}
                                onChange={(e) => void attachResultFile(ex, e.target.files?.[0] ?? null)}
                              />
                            </label>
                          ) : null}
                          {!locked ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--danger-outline"
                              onClick={() => void removeExam(ex)}
                            >
                              Remover
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
        </div>
      ) : hideEmptyState ? null : (
        <p className="hub-cws-exam-empty">Nenhum exame neste atendimento ainda.</p>
      )}

      {documents.length > 0 ? (
        <div className="hub-rx-history">
          <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
            Histórico de emissões (versões)
          </span>
          <ul className="hub-rx-history__list">
            {documents.map((d) => {
              const publicLink = d.validation_url ?? d.public_url ?? null;
              return (
                <li key={d.id} className="hub-rx-history__item">
                  <div>
                    <strong>Versão {d.version_no}</strong>
                    {d.scope === 'single' && d.exam_id ? ' · item individual' : ' · consolidado'}
                    {d.validation_code ? ` · ${d.validation_code}` : ''}
                    {d.issued_at
                      ? ` — ${new Date(d.issued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                      : ''}
                    {d.issued_by_member?.full_name ? ` — ${d.issued_by_member.full_name}` : ''}
                  </div>
                  <div className="hub-rx-history__item-actions">
                    <HubPrescriptionDocumentBadge status={d.document_status} />
                    <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void downloadPdf(d.id)}>
                      PDF
                    </button>
                    {publicLink ? (
                      <>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--sm"
                          onClick={() => openIssuePanel(d, publicLink)}
                        >
                          Link / QR
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--sm"
                          title={guardianPhone ? undefined : 'Cadastre o telefone do tutor'}
                          onClick={() => shareWhatsApp(publicLink)}
                        >
                          WhatsApp
                        </button>
                      </>
                    ) : null}
                    {d.document_status !== 'revoked' ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--danger-outline"
                        onClick={() => setRevokeDoc(d)}
                      >
                        Revogar
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <HubClinicalDocumentIssuePanel
        open={issuePanelOpen}
        onClose={() => {
          setIssuePanelOpen(false);
          setIssuePanelError(null);
          setIssuePanelLoading(false);
        }}
        loading={issuePanelLoading}
        error={issuePanelError}
        document={issuedDoc}
        publicUrl={issuedPublicUrl}
        contentHashShort={issuedHashShort}
        titleLoading="Gerando solicitação de exames validável…"
        titleReady="Solicitação de exames emitida"
        subtitleLoading="Aguarde enquanto preparamos o PDF, o link e o código de validação."
        disclaimers={EXAM_ORDER_DISCLAIMERS}
        downloading={downloadingPdf}
        onDownloadPdf={issuedDoc ? () => void downloadPdf(issuedDoc.id) : undefined}
        onCopySuccess={showSuccess}
        onCopyError={showError}
      />

      <HubPrescriptionRevokeModal
        open={Boolean(revokeDoc)}
        onClose={() => setRevokeDoc(null)}
        document={revokeDoc as HubPrescriptionDocumentRow | null}
        submitting={revoking}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
