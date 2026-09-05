import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import { HubClinicalDocumentIssuePanel } from '../../components/clinical/HubClinicalDocumentIssuePanel';
import { HubPrescriptionRevokeModal } from '../../components/clinical/HubPrescriptionRevokeModal';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';
import {
  hubSpecialistReferralsApi,
  openBlankPdfPreviewTab,
  openHubClinicalDocumentPdf,
  type HubClinicalDocumentRow,
  type HubEncounter,
  type HubPrescriptionDocumentRow,
  type HubSpecialistReferral,
} from '../../api/hubClinicalApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { logMessageAttempt } from '../../api/hubMessageLogsApi';
import {
  buildSpecialistReferralWhatsAppMessage,
  openSpecialistReferralWhatsApp,
} from './hubSpecialistReferralShareUtils';
import { HubSearchableCombobox } from '../../components/HubSearchableCombobox';
import { HubCwsChoiceChips } from './HubCwsChoiceChips';
import { HubCwsStatusPills } from './HubCwsStatusPills';
import { REFERRAL_PRIORITY_OPTIONS, REFERRAL_SPECIALTY_OPTIONS } from './referralSpecialtyOptions';

const SPECIALIST_REFERRAL_DISCLAIMERS = [
  'Documento gerado pelo PetMi Hub para validação de autenticidade. Não substitui documentos regulatórios específicos.',
  'O encaminhamento é uma orientação clínica; a consulta com especialista depende de disponibilidade e critérios do profissional destino.',
  'Este documento não garante agendamento ou aceitação pelo especialista indicado.',
];

type ClinicalDocRow = HubClinicalDocumentRow & { referral_id?: string | null };

function specialistReferralPdfPath(referralId: string, documentId: string, clinicId: string): string {
  const q = new URLSearchParams({ clinic_id: clinicId, document_id: documentId });
  return `/api/hub/clinical/specialist-referrals/${encodeURIComponent(referralId)}/pdf?${q}`;
}

function isReferralEditLocked(readOnly: boolean, referral: HubSpecialistReferral): boolean {
  return readOnly || referral.status === 'issued';
}

function resolveIssueBlockReason(encounter: HubEncounter, referrals: HubSpecialistReferral[]): string | null {
  if (!referrals.length) return 'Adicione ao menos um encaminhamento antes de gerar o documento.';
  if (!encounter.pet_id) return 'Vincule um pet ao atendimento antes de emitir.';
  if (!encounter.hub_staff_member_id) {
    return 'Defina o veterinário responsável no atendimento antes de emitir.';
  }
  return null;
}

function resolveRevokeReferralId(doc: ClinicalDocRow, referrals: HubSpecialistReferral[]): string {
  if (doc.referral_id) return doc.referral_id;
  return referrals[0]?.id ?? doc.id;
}

function resolvePdfReferralId(doc: ClinicalDocRow, referrals: HubSpecialistReferral[]): string {
  if (doc.referral_id) return doc.referral_id;
  return referrals[0]?.id ?? doc.id;
}

const PRIORITY_LABELS = { routine: 'Rotina', urgent: 'Urgente' } as const;

const emptyDraft = () => ({
  specialty: '',
  specialist_name: '',
  specialist_contact: '',
  referral_reason: '',
  clinical_summary: '',
  priority: 'routine' as 'routine' | 'urgent',
});

export function HubWorkspaceSpecialistReferrals({
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
  const [referrals, setReferrals] = useState<HubSpecialistReferral[]>([]);
  const [documents, setDocuments] = useState<ClinicalDocRow[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [issuing, setIssuing] = useState(false);
  const [issuingReferralId, setIssuingReferralId] = useState<string | null>(null);
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

  const reloadReferrals = useCallback(async () => {
    const r = await hubSpecialistReferralsApi.list(clinicId, { encounterId: encounter.id });
    setReferrals(r.referrals ?? []);
  }, [clinicId, encounter.id]);

  const reloadDocuments = useCallback(async () => {
    const r = await hubSpecialistReferralsApi.listDocumentsByEncounter(encounter.id, clinicId);
    setDocuments((r.documents ?? []) as ClinicalDocRow[]);
  }, [clinicId, encounter.id]);

  useEffect(() => {
    void reloadReferrals().catch(() => setReferrals([]));
    void reloadDocuments().catch(() => setDocuments([]));
  }, [reloadReferrals, reloadDocuments]);

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

  const issueBlockReason = useMemo(() => resolveIssueBlockReason(encounter, referrals), [encounter, referrals]);

  const referralStats = useMemo(() => {
    let pendentes = 0;
    let emitidos = 0;
    for (const ref of referrals) {
      if (ref.status === 'cancelled') continue;
      if (ref.status === 'issued') emitidos += 1;
      else pendentes += 1;
    }
    return { total: referrals.length, pendentes, emitidos };
  }, [referrals]);

  const specialtyOptions = useMemo(() => {
    const opts = REFERRAL_SPECIALTY_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
    const cur = draft.specialty.trim();
    if (cur && !opts.some((o) => o.value.toLowerCase() === cur.toLowerCase())) {
      opts.push({ value: draft.specialty, label: draft.specialty });
    }
    return opts;
  }, [draft.specialty]);

  const openIssuePanel = (doc: ClinicalDocRow, publicUrl?: string | null) => {
    setIssuePanelError(null);
    setIssuePanelLoading(false);
    setIssuedDoc(doc);
    setIssuedPublicUrl(publicUrl ?? doc.validation_url ?? doc.public_url ?? null);
    setIssuedHashShort(doc.content_hash_short ?? null);
    setIssuePanelOpen(true);
  };

  const downloadPdf = async (doc: ClinicalDocRow) => {
    const referralId = resolvePdfReferralId(doc, referrals);
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
    try {
      const mode = await openHubClinicalDocumentPdf(
        specialistReferralPdfPath(referralId, doc.id, clinicId),
        `encaminhamento-${doc.id.slice(0, 8)}.pdf`,
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
    const message = buildSpecialistReferralWhatsAppMessage({
      tutorName: encounter.guardian?.full_name,
      petName: encounter.pet?.name,
      publicLink,
      templateOverrides: messageTemplateOverrides,
    });
    const href = openSpecialistReferralWhatsApp(guardianPhone, message);
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
      template_key: 'specialist_referral_share',
      triggered_by_staff_id: encounter.hub_staff_member_id ?? null,
    });
  };

  const afterIssue = async (
    res: { document: HubClinicalDocumentRow; public_url?: string; content_hash_short?: string },
    pdfPreviewWindow: Window | null,
  ) => {
    const doc = res.document as ClinicalDocRow;
    setIssuedDoc(doc);
    setIssuedPublicUrl(res.public_url ?? doc.public_url ?? doc.validation_url ?? null);
    setIssuedHashShort(res.content_hash_short ?? doc.content_hash_short ?? null);
    await reloadReferrals();
    await reloadDocuments();
    showSuccess('Encaminhamento emitido — PDF e link prontos');
    onClinicalRefresh?.();

    try {
      const referralId = resolvePdfReferralId(doc, referrals);
      const mode = await openHubClinicalDocumentPdf(
        specialistReferralPdfPath(referralId, doc.id, clinicId),
        `encaminhamento-${doc.id.slice(0, 8)}.pdf`,
        pdfPreviewWindow,
      );
      if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
    } catch (pdfErr: unknown) {
      showError((pdfErr as Error)?.message || 'Documento emitido, mas não foi possível abrir o PDF.');
    }
  };

  const issueBundle = async () => {
    if (issueBlockReason) {
      showError(issueBlockReason);
      return;
    }

    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setIssuePanelError(null);
    setIssuePanelOpen(true);
    setIssuePanelLoading(true);
    setIssuing(true);

    try {
      const res = await hubSpecialistReferralsApi.issueBundle({
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        scope: 'encounter_bundle',
        issued_by: encounter.hub_staff_member_id,
      });
      await afterIssue(res, pdfPreviewWindow);
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      const message = (e as Error)?.message || 'Erro ao emitir encaminhamento';
      setIssuePanelError(message);
      showError(message);
    } finally {
      setIssuePanelLoading(false);
      setIssuing(false);
    }
  };

  const issueSingle = async (referral: HubSpecialistReferral) => {
    if (issueBlockReason) {
      showError(issueBlockReason);
      return;
    }

    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setIssuePanelError(null);
    setIssuePanelOpen(true);
    setIssuePanelLoading(true);
    setIssuing(true);
    setIssuingReferralId(referral.id);

    try {
      const res = await hubSpecialistReferralsApi.issueDocument(referral.id, {
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        scope: 'single',
        issued_by: encounter.hub_staff_member_id,
      });
      await afterIssue(res, pdfPreviewWindow);
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      const message = (e as Error)?.message || 'Erro ao emitir encaminhamento';
      setIssuePanelError(message);
      showError(message);
    } finally {
      setIssuePanelLoading(false);
      setIssuing(false);
      setIssuingReferralId(null);
    }
  };

  const createReferral = async () => {
    if (!draft.specialty.trim() || !draft.referral_reason.trim() || readOnly || requesting) return;
    setRequesting(true);
    try {
      await hubSpecialistReferralsApi.create({
        clinic_id: clinicId,
        pet_id: encounter.pet_id ?? '',
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? null,
        guardian_id: encounter.guardian_id ?? null,
        requested_by: encounter.hub_staff_member_id ?? null,
        specialty: draft.specialty.trim(),
        specialist_name: draft.specialist_name.trim() || null,
        specialist_contact: draft.specialist_contact.trim() || null,
        referral_reason: draft.referral_reason.trim(),
        clinical_summary: draft.clinical_summary.trim() || null,
        priority: draft.priority,
      });
      setDraft(emptyDraft());
      await reloadReferrals();
      showSuccess('Encaminhamento registrado');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar encaminhamento');
    } finally {
      setRequesting(false);
    }
  };

  const removeReferral = async (referral: HubSpecialistReferral) => {
    if (isReferralEditLocked(readOnly, referral)) return;
    try {
      await hubSpecialistReferralsApi.remove(referral.id, clinicId);
      await reloadReferrals();
      showSuccess('Encaminhamento removido');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover encaminhamento');
    }
  };

  const confirmRevoke = async (reason: string) => {
    if (!revokeDoc) return;
    const referralId = resolveRevokeReferralId(revokeDoc, referrals);
    setRevoking(true);
    try {
      await hubSpecialistReferralsApi.revokeDocument(referralId, revokeDoc.id, {
        clinic_id: clinicId,
        reason,
        revoked_by: encounter.hub_staff_member_id,
      });
      setRevokeDoc(null);
      await reloadDocuments();
      await reloadReferrals();
      showSuccess('Documento revogado');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao revogar documento');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: referralStats.total },
          { label: 'Pendentes', value: referralStats.pendentes, tone: 'amber' },
          { label: 'Emitidos', value: referralStats.emitidos, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Encaminhe ao especialista e emita o PDF com link validável. Depois de emitir, o item trava — gere outra versão
        se precisar mudar.
      </p>

      {!readOnly ? (
        <div className="hub-cws-exam-form">
          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="referral_specialty">Especialidade</label>
            <HubSearchableCombobox
              id="referral_specialty"
              options={specialtyOptions}
              value={draft.specialty}
              onChange={(next) => setDraft((d) => ({ ...d, specialty: next }))}
              placeholder="Buscar no catálogo, ou criar outra…"
              searchPlaceholder="Cardiologia, dermatologia…"
              allowCreate
              createEntityLabel="especialidade"
              ariaLabel="Especialidade"
            />
          </div>

          <div className="hub-cws-exam-form__meta">
            <HubCwsChoiceChips
              options={REFERRAL_PRIORITY_OPTIONS}
              value={draft.priority}
              ariaLabel="Prioridade"
              onChange={(next) => {
                if (next !== 'routine' && next !== 'urgent') return;
                setDraft((d) => ({ ...d, priority: next }));
              }}
            />
          </div>

          <div className="hub-cws-field-grid hub-cws-field-grid--2">
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="referral_specialist">Especialista</label>
              <input
                id="referral_specialist"
                value={draft.specialist_name}
                onChange={(e) => setDraft((d) => ({ ...d, specialist_name: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="hub-clinic-field hub-cws-field-tight">
              <label htmlFor="referral_contact">Contato</label>
              <input
                id="referral_contact"
                value={draft.specialist_contact}
                onChange={(e) => setDraft((d) => ({ ...d, specialist_contact: e.target.value }))}
                placeholder="Telefone, e-mail ou clínica"
              />
            </div>
          </div>

          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="referral_reason">Motivo do encaminhamento</label>
            <input
              id="referral_reason"
              value={draft.referral_reason}
              onChange={(e) => setDraft((d) => ({ ...d, referral_reason: e.target.value }))}
              placeholder="Por que este encaminhamento agora"
            />
          </div>

          <div className="hub-clinic-field hub-cws-field-tight">
            <label htmlFor="referral_summary">Resumo clínico</label>
            <input
              id="referral_summary"
              value={draft.clinical_summary}
              onChange={(e) => setDraft((d) => ({ ...d, clinical_summary: e.target.value }))}
              placeholder="Opcional — o que o especialista precisa saber"
            />
          </div>

          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
            disabled={!draft.specialty.trim() || !draft.referral_reason.trim() || requesting}
            onClick={() => void createReferral()}
          >
            {requesting ? 'Registrando…' : 'Registrar encaminhamento'}
          </button>
        </div>
      ) : null}

      {issueBlockReason ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {issueBlockReason}
        </p>
      ) : null}

      {referrals.length > 0 ? (
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Encaminhamentos deste atendimento</strong>
            <div className="hub-rx-panel__actions">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                disabled={issuing || Boolean(issueBlockReason)}
                title={issueBlockReason ?? undefined}
                onClick={() => void issueBundle()}
              >
                {issuing && !issuingReferralId
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
                  <th>Especialidade</th>
                  <th>Especialista</th>
                  <th>Motivo</th>
                  <th>Prioridade</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {referrals.map((ref) => {
                  const locked = isReferralEditLocked(readOnly, ref);
                  return (
                    <tr key={ref.id}>
                      <td>
                        <strong>{ref.specialty}</strong>
                        {ref.status === 'issued' ? (
                          <span className="hub-rx-badge hub-rx-badge--issued" style={{ marginTop: 4, display: 'inline-block' }}>
                            Emitido
                          </span>
                        ) : null}
                        {ref.clinical_summary ? (
                          <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                            {ref.clinical_summary}
                          </div>
                        ) : null}
                      </td>
                      <td className="hub-clientes__muted">
                        {ref.specialist_name || 'Não informado'}
                        {ref.specialist_contact ? (
                          <div style={{ fontSize: 12 }}>{ref.specialist_contact}</div>
                        ) : null}
                      </td>
                      <td className="hub-clientes__muted">{ref.referral_reason}</td>
                      <td>{PRIORITY_LABELS[ref.priority]}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                          {ref.status !== 'issued' ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--sm"
                              disabled={issuing || Boolean(issueBlockReason)}
                              onClick={() => void issueSingle(ref)}
                            >
                              {issuingReferralId === ref.id ? 'Emitindo…' : 'Emitir só este item'}
                            </button>
                          ) : null}
                          {!locked ? (
                            <button
                              type="button"
                              className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--danger-outline"
                              onClick={() => void removeReferral(ref)}
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
        <p className="hub-cws-exam-empty">Nenhum encaminhamento neste atendimento ainda.</p>
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
                    {d.scope === 'single' && d.referral_id ? ' · item individual' : ' · consolidado'}
                    {d.validation_code ? ` · ${d.validation_code}` : ''}
                    {d.issued_at
                      ? ` — ${new Date(d.issued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                      : ''}
                  </div>
                  <div className="hub-rx-history__item-actions">
                    <HubPrescriptionDocumentBadge status={d.document_status} />
                    <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void downloadPdf(d)}>
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
        titleLoading="Gerando encaminhamento validável…"
        titleReady="Encaminhamento emitido"
        subtitleLoading="Aguarde enquanto preparamos o PDF, o link e o código de validação."
        disclaimers={SPECIALIST_REFERRAL_DISCLAIMERS}
        downloading={downloadingPdf}
        onDownloadPdf={issuedDoc ? () => void downloadPdf(issuedDoc) : undefined}
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
