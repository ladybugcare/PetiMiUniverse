import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import {
  HubPrescriptionItemForm,
  emptyPrescriptionItemDraft,
  type PrescriptionItemDraft,
} from '../../components/clinical/HubPrescriptionItemForm';
import { HubPrescriptionIssuePanel } from '../../components/clinical/HubPrescriptionIssuePanel';
import { HubPrescriptionRevokeModal } from '../../components/clinical/HubPrescriptionRevokeModal';
import { HubPrescriptionDocumentBadge } from '../../components/clinical/HubPrescriptionDocumentBadge';
import {
  hubClinicalApi,
  openBlankPdfPreviewTab,
  openHubPrescriptionPdf,
  type HubEncounter,
  type HubPrescription,
  type HubPrescriptionDocumentRow,
  type HubPrescriptionItem,
} from '../../api/hubClinicalApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { formatPrescriptionItemMeta } from './clinicalDisplay';

function prescriptionItemToPayload(it: HubPrescriptionItem) {
  const administration = it.administration === 'administered_in_clinic' ? 'administered_in_clinic' : 'home_use';
  return {
    medication_name: it.medication_name,
    presentation: it.presentation ?? null,
    concentration: it.concentration ?? it.dosage ?? null,
    quantity: it.quantity ?? null,
    posology: it.posology ?? it.frequency ?? null,
    dosage: it.dosage ?? it.concentration ?? null,
    frequency: it.frequency ?? it.posology ?? null,
    duration: it.duration ?? null,
    instructions: it.instructions ?? null,
    hub_inventory_item_id: it.hub_inventory_item_id ?? null,
    administration,
  };
}

function draftToCreateItem(draft: PrescriptionItemDraft) {
  return {
    medication_name: draft.medication_name.trim(),
    presentation: draft.presentation.trim() || null,
    concentration: draft.concentration.trim() || null,
    quantity: draft.quantity.trim() || null,
    posology: draft.posology.trim() || null,
    dosage: draft.concentration.trim() || null,
    frequency: draft.posology.trim() || null,
    duration: draft.duration.trim() || null,
    instructions: draft.instructions.trim() || null,
    hub_inventory_item_id: draft.hub_inventory_item_id || null,
    administration: draft.administration,
  };
}

function isActivePrescriptionStatus(status: string | undefined): boolean {
  return status === undefined || status === 'active' || status === 'draft' || status === 'issued';
}

function resolveIssueBlockReason(opts: {
  readOnly: boolean;
  canonicalRx: HubPrescription | null;
  encounter: HubEncounter;
}): string | null {
  const { readOnly, canonicalRx, encounter } = opts;
  if (readOnly) return 'Atendimento somente leitura — não é possível emitir receita.';
  if (!canonicalRx) return 'Adicione ao menos um medicamento antes de gerar a receita.';
  if (!(canonicalRx.items?.length ?? 0)) return 'Adicione ao menos um medicamento antes de gerar a receita.';
  if (!encounter.pet_id) return 'Vincule um pet ao atendimento antes de emitir.';
  if (!encounter.hub_staff_member_id) {
    return 'Defina o veterinário responsável no atendimento antes de emitir.';
  }
  return null;
}

export function HubWorkspacePrescriptions({
  encounter,
  clinicId,
  readOnly,
  onClinicalRefresh,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
}) {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubPrescription[]>([]);
  const [documents, setDocuments] = useState<HubPrescriptionDocumentRow[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [draft, setDraft] = useState<PrescriptionItemDraft>(emptyPrescriptionItemDraft);
  const [medicationItems, setMedicationItems] = useState<HubInventoryItem[]>([]);
  const [notesDraft, setNotesDraft] = useState('');
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuePanelLoading, setIssuePanelLoading] = useState(false);
  const [issuePanelError, setIssuePanelError] = useState<string | null>(null);
  const [issuedDoc, setIssuedDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [issuedHashShort, setIssuedHashShort] = useState<string | null>(null);
  const [revokeDoc, setRevokeDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const reloadList = useCallback(async () => {
    const r = await hubClinicalApi.listPrescriptions(clinicId, encounter.pet_id ?? undefined);
    setItems(r.prescriptions ?? []);
  }, [clinicId, encounter.pet_id]);

  const reloadDocuments = useCallback(
    async (prescriptionId: string) => {
      const r = await hubClinicalApi.listPrescriptionDocuments(prescriptionId, clinicId);
      setDocuments(r.documents ?? []);
    },
    [clinicId],
  );

  const canonicalRx = useMemo(() => {
    const sameEncounter = items.filter(
      (p) => p.hub_encounter_id === encounter.id && isActivePrescriptionStatus(p.status),
    );
    sameEncounter.sort((a, b) => {
      const ta = new Date(a.prescribed_at || 0).getTime();
      const tb = new Date(b.prescribed_at || 0).getTime();
      return tb - ta;
    });
    return sameEncounter[0] ?? null;
  }, [items, encounter.id]);

  const editLocked = readOnly || canonicalRx?.status === 'issued';
  const issueBlockReason = useMemo(
    () => resolveIssueBlockReason({ readOnly, canonicalRx, encounter }),
    [readOnly, canonicalRx, encounter],
  );

  const issueWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!encounter.hub_staff_member_id) warnings.push('Atendimento sem veterinário responsável.');
    if (!encounter.pet_id) warnings.push('Atendimento sem pet vinculado.');
    const meds = canonicalRx?.items ?? [];
    if (meds.some((m) => !m.posology && !m.frequency && !m.quantity)) {
      warnings.push('Alguns itens estão sem posologia ou quantidade — revise antes de emitir.');
    }
    return warnings;
  }, [encounter, canonicalRx?.items]);

  const caseLinkedOthers = useMemo(() => {
    if (!encounter.hub_case_id) return [];
    return items.filter(
      (p) =>
        p.hub_case_id === encounter.hub_case_id &&
        p.hub_encounter_id !== encounter.id &&
        p.id !== canonicalRx?.id &&
        isActivePrescriptionStatus(p.status),
    );
  }, [items, encounter.hub_case_id, encounter.id, canonicalRx?.id]);

  useEffect(() => {
    void reloadList();
    void hubInventoryApi.items
      .list(clinicId, false, 'medication')
      .then((r) => setMedicationItems(r.items ?? []))
      .catch(() => setMedicationItems([]));
  }, [clinicId, encounter.pet_id, reloadList]);

  useEffect(() => {
    setNotesDraft(canonicalRx?.notes?.trim() ? String(canonicalRx.notes) : '');
  }, [canonicalRx?.id, canonicalRx?.notes]);

  useEffect(() => {
    if (!canonicalRx?.id) {
      setDocuments([]);
      return;
    }
    void reloadDocuments(canonicalRx.id).catch(() => setDocuments([]));
  }, [canonicalRx?.id, reloadDocuments]);

  const add = async () => {
    if (!draft.medication_name.trim() || editLocked) return;
    try {
      await hubClinicalApi.createPrescription({
        clinic_id: clinicId,
        hub_encounter_id: encounter.id,
        hub_case_id: encounter.hub_case_id ?? undefined,
        pet_id: encounter.pet_id ?? '',
        hub_staff_member_id: encounter.hub_staff_member_id,
        items: [draftToCreateItem(draft)],
      });
      setDraft(emptyPrescriptionItemDraft());
      await reloadList();
      showSuccess('Medicamento incluído na prescrição do atendimento');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar prescrição');
    }
  };

  const saveNotes = async () => {
    if (!canonicalRx || editLocked) return;
    try {
      await hubClinicalApi.patchPrescription(canonicalRx.id, {
        clinic_id: clinicId,
        notes: notesDraft.trim() ? notesDraft.trim() : null,
      });
      await reloadList();
      showSuccess('Observações da prescrição salvas');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar observações');
    }
  };

  const removeItemAt = async (index: number) => {
    if (!canonicalRx || editLocked) return;
    const list = [...(canonicalRx.items ?? [])];
    if (index < 0 || index >= list.length) return;
    if (list.length <= 1) {
      showError('A prescrição precisa ter pelo menos um medicamento. Remova itens só quando houver mais de um.');
      return;
    }
    list.splice(index, 1);
    try {
      await hubClinicalApi.patchPrescription(canonicalRx.id, {
        clinic_id: clinicId,
        items: list.map(prescriptionItemToPayload),
      });
      await reloadList();
      showSuccess('Item removido');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover item');
    }
  };

  const issueValidatable = async () => {
    if (!canonicalRx) {
      showError('Adicione ao menos um medicamento antes de gerar a receita.');
      return;
    }
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
      const res = await hubClinicalApi.issuePrescriptionDocument(canonicalRx.id, {
        clinic_id: clinicId,
        issued_by: encounter.hub_staff_member_id,
      });
      setIssuedDoc(res.document);
      setIssuedPublicUrl(res.public_url ?? res.document.public_url ?? res.document.validation_url ?? null);
      setIssuedHashShort(res.content_hash_short ?? res.document.content_hash_short ?? null);
      await reloadList();
      await reloadDocuments(canonicalRx.id);
      showSuccess('Receita validável emitida — PDF e link prontos');
      onClinicalRefresh?.();

      try {
        const mode = await openHubPrescriptionPdf(canonicalRx.id, clinicId, res.document.id, pdfPreviewWindow);
        if (mode === 'download') {
          showSuccess('PDF baixado — verifique a pasta Downloads');
        }
      } catch (pdfErr: unknown) {
        showError((pdfErr as Error)?.message || 'Receita emitida, mas não foi possível abrir o PDF.');
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      const message = (e as Error)?.message || 'Erro ao emitir receita validável';
      setIssuePanelError(message);
      showError(message);
    } finally {
      setIssuePanelLoading(false);
      setIssuing(false);
    }
  };

  const downloadPdf = async (documentId?: string) => {
    if (!canonicalRx) return;
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
    try {
      const mode = await openHubPrescriptionPdf(canonicalRx.id, clinicId, documentId, pdfPreviewWindow);
      if (mode === 'download') {
        showSuccess('PDF baixado — verifique a pasta Downloads');
      }
    } catch (e: unknown) {
      pdfPreviewWindow?.close();
      showError((e as Error)?.message || 'Erro ao abrir PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const hasPrescriptionItems = Boolean(canonicalRx?.items?.length);
  const latestDocumentId = documents[0]?.id;

  const confirmRevoke = async (reason: string) => {
    if (!canonicalRx || !revokeDoc) return;
    setRevoking(true);
    try {
      await hubClinicalApi.revokePrescriptionDocument(canonicalRx.id, revokeDoc.id, {
        clinic_id: clinicId,
        reason,
        revoked_by: encounter.hub_staff_member_id,
      });
      setRevokeDoc(null);
      await reloadDocuments(canonicalRx.id);
      showSuccess('Receita revogada');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao revogar receita');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <p className="hub-clientes__muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Uma prescrição por atendimento. Após emitir a receita validável, o conteúdo fica bloqueado para edição.
      </p>

      {!editLocked ? (
        <HubPrescriptionItemForm
          draft={draft}
          onChange={setDraft}
          onAdd={() => void add()}
          medicationItems={medicationItems}
        />
      ) : canonicalRx?.status === 'issued' ? (
        <p className="hub-rx-locked-note">Prescrição emitida — edição bloqueada. Reemita uma nova versão ou revogue no histórico.</p>
      ) : null}

      {issueBlockReason && !readOnly && canonicalRx ? (
        <p className="hub-rx-warnings hub-rx-warnings--inline" role="status">
          {issueBlockReason}
        </p>
      ) : null}

      {issueWarnings.length > 0 && !editLocked ? (
        <ul className="hub-rx-warnings">
          {issueWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {canonicalRx ? (
        <div className="hub-clinic-records__panel hub-rx-panel">
          <div className="hub-rx-panel__head">
            <strong>Prescrição deste atendimento</strong>
            {canonicalRx.status === 'issued' ? (
              <span className="hub-rx-badge hub-rx-badge--issued">Emitida</span>
            ) : null}
            <div className="hub-rx-panel__actions">
              {!readOnly ? (
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                  disabled={issuing}
                  title={issueBlockReason ?? undefined}
                  onClick={() => void issueValidatable()}
                >
                  {issuing
                    ? 'Gerando…'
                    : documents.length
                      ? 'Gerar novo PDF e link validável'
                      : 'Gerar PDF e link validável'}
                </button>
              ) : null}
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--sm"
                disabled={downloadingPdf || !hasPrescriptionItems}
                title={
                  !hasPrescriptionItems
                    ? 'Adicione medicamentos para gerar PDF'
                    : latestDocumentId
                      ? 'Abrir PDF da última emissão validável'
                      : 'Abrir PDF simples da prescrição'
                }
                onClick={() => void downloadPdf(latestDocumentId)}
              >
                {downloadingPdf ? 'Abrindo PDF…' : 'Abrir PDF'}
              </button>
            </div>
          </div>

          <ul className="hub-cws-rx-list">
            {(canonicalRx.items ?? []).map((it, idx) => (
              <li key={it.id ?? `${canonicalRx.id}-${idx}`} className="hub-cws-rx-item">
                <div className="hub-cws-rx-item__name">{it.medication_name}</div>
                <div className="hub-cws-rx-item__meta">{formatPrescriptionItemMeta(it)}</div>
                {!editLocked ? (
                  <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void removeItemAt(idx)}>
                    Remover
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {!editLocked ? (
            <div className="hub-clientes__form-stack" style={{ marginBottom: 0 }}>
              <label className="hub-clientes__muted" style={{ fontSize: 12 }}>
                Observações da prescrição
                <textarea
                  className="hub-clientes__input"
                  rows={2}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Orientações gerais, alertas de administração…"
                />
              </label>
              <button type="button" className="hub-clientes__btn hub-clientes__btn--sm" onClick={() => void saveNotes()}>
                Salvar observações
              </button>
            </div>
          ) : canonicalRx.notes ? (
            <p className="hub-clientes__muted" style={{ marginBottom: 0 }}>
              {String(canonicalRx.notes)}
            </p>
          ) : null}

          {documents.length > 0 ? (
            <div className="hub-rx-history">
              <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
                Histórico de emissões (versões)
              </span>
              <ul className="hub-rx-history__list">
                {documents.map((d) => (
                  <li key={d.id} className="hub-rx-history__item">
                    <div>
                      <strong>Versão {d.version_no}</strong>
                      {d.validation_code ? ` · ${d.validation_code}` : ''}
                      {d.issued_at
                        ? ` — ${new Date(d.issued_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                        : ''}
                      {d.issued_by_member?.full_name ? ` — ${d.issued_by_member.full_name}` : ''}
                    </div>
                    <div className="hub-rx-history__item-actions">
                      <HubPrescriptionDocumentBadge status={d.document_status} />
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--sm"
                        onClick={() => void downloadPdf(d.id)}
                      >
                        PDF
                      </button>
                      {d.validation_url || d.public_url ? (
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--sm"
                          onClick={() => {
                            setIssuePanelError(null);
                            setIssuePanelLoading(false);
                            setIssuedDoc(d);
                            setIssuedPublicUrl(d.validation_url ?? d.public_url ?? null);
                            setIssuedHashShort(d.content_hash_short ?? null);
                            setIssuePanelOpen(true);
                          }}
                        >
                          Link / QR
                        </button>
                      ) : null}
                      {!readOnly && d.document_status !== 'revoked' ? (
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
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hub-clientes__muted" style={{ marginBottom: 12 }}>
          Nenhuma prescrição neste atendimento ainda. Use o formulário acima para adicionar o primeiro medicamento.
        </p>
      )}

      {caseLinkedOthers.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
            Outras prescrições do mesmo caso (outros atendimentos)
          </span>
          <ul className="hub-clinic-records__list">
            {caseLinkedOthers.map((p) => (
              <li key={p.id}>
                {(p.items ?? []).map((it) => it.medication_name).join(', ') || 'Prescrição'}
                <button
                  type="button"
                  className="hub-clientes__btn hub-clientes__btn--sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    const w = openBlankPdfPreviewTab();
                    void openHubPrescriptionPdf(p.id, clinicId, undefined, w)
                      .then((mode) => {
                        if (mode === 'download') showSuccess('PDF baixado — verifique a pasta Downloads');
                      })
                      .catch((e: unknown) => {
                        w?.close();
                        showError((e as Error)?.message || 'Erro ao abrir PDF');
                      });
                  }}
                >
                  PDF
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <HubPrescriptionIssuePanel
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
        downloading={downloadingPdf}
        onDownloadPdf={issuedDoc && canonicalRx ? () => void downloadPdf(issuedDoc.id) : undefined}
        onCopySuccess={showSuccess}
        onCopyError={showError}
      />

      <HubPrescriptionRevokeModal
        open={Boolean(revokeDoc)}
        onClose={() => setRevokeDoc(null)}
        document={revokeDoc}
        submitting={revoking}
        onConfirm={confirmRevoke}
      />
    </>
  );
}
