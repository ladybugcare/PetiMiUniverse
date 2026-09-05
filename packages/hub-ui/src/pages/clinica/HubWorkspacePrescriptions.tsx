import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAlert } from '../../components/AlertProvider';
import {
  HubPrescriptionItemForm,
  emptyPrescriptionItemDraft,
  prescriptionItemToDraft,
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
import { HubCwsStatusPills } from './HubCwsStatusPills';

function prescriptionItemToPayload(it: HubPrescriptionItem) {
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
    administration: 'home_use' as const,
    use_route: it.use_route ?? null,
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
    hub_inventory_item_id: null,
    administration: 'home_use' as const,
    use_route: draft.use_route.trim() || null,
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
  hideEmptyState = false,
}: {
  encounter: HubEncounter;
  clinicId: string;
  readOnly: boolean;
  onClinicalRefresh?: () => void;
  /** Esconde o aviso de “nenhuma receita” quando a listagem unificada fica fora da aba. */
  hideEmptyState?: boolean;
}) {
  const { showError, showSuccess } = useAlert();
  const [items, setItems] = useState<HubPrescription[]>([]);
  const [documents, setDocuments] = useState<HubPrescriptionDocumentRow[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [draft, setDraft] = useState<PrescriptionItemDraft>(emptyPrescriptionItemDraft);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuePanelLoading, setIssuePanelLoading] = useState(false);
  const [issuePanelError, setIssuePanelError] = useState<string | null>(null);
  const [issuedDoc, setIssuedDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [issuedHashShort, setIssuedHashShort] = useState<string | null>(null);
  const [revokeDoc, setRevokeDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

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

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(emptyPrescriptionItemDraft());
  };

  const startEdit = (index: number) => {
    if (!canonicalRx || editLocked) return;
    const it = (canonicalRx.items ?? [])[index];
    if (!it) return;
    setEditingIndex(index);
    setDraft(prescriptionItemToDraft(it));
  };

  const add = async () => {
    if (!draft.medication_name.trim() || editLocked || savingItem) return;
    setSavingItem(true);
    try {
      if (editingIndex != null && canonicalRx) {
        const list = [...(canonicalRx.items ?? [])];
        if (editingIndex < 0 || editingIndex >= list.length) return;
        list[editingIndex] = {
          ...list[editingIndex],
          ...draftToCreateItem(draft),
        };
        await hubClinicalApi.patchPrescription(canonicalRx.id, {
          clinic_id: clinicId,
          items: list.map(prescriptionItemToPayload),
        });
        setEditingIndex(null);
        setDraft(emptyPrescriptionItemDraft());
        await reloadList();
        showSuccess('Medicamento atualizado');
        onClinicalRefresh?.();
        return;
      }
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
      showSuccess('Medicamento incluído na receita do atendimento');
      onClinicalRefresh?.();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar receita');
    } finally {
      setSavingItem(false);
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
      showSuccess('Observações da receita salvas');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar observações');
    }
  };

  const removeItemAt = async (index: number) => {
    if (!canonicalRx || editLocked) return;
    const list = [...(canonicalRx.items ?? [])];
    if (index < 0 || index >= list.length) return;
    if (list.length <= 1) {
      showError('A receita precisa ter pelo menos um medicamento. Remova itens só quando houver mais de um.');
      return;
    }
    list.splice(index, 1);
    try {
      await hubClinicalApi.patchPrescription(canonicalRx.id, {
        clinic_id: clinicId,
        items: list.map(prescriptionItemToPayload),
      });
      if (editingIndex === index) {
        cancelEdit();
      } else if (editingIndex != null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
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
  const rxItems = canonicalRx?.items ?? [];
  const rxIssued = canonicalRx?.status === 'issued';
  const rxStats = {
    total: rxItems.length,
    pendentes: rxIssued ? 0 : rxItems.length,
    emitidos: rxIssued ? rxItems.length : 0,
  };

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
      <HubCwsStatusPills
        items={[
          { label: 'Total', value: rxStats.total },
          { label: 'Pendentes', value: rxStats.pendentes, tone: 'amber' },
          { label: 'Emitidos', value: rxStats.emitidos, tone: 'green' },
        ]}
      />

      <p className="hub-cws-an-block__hint">
        Inclua os medicamentos de uso em casa e emita o PDF com link validável. Depois de emitir, o item trava — gere
        outra versão se precisar mudar.
      </p>

      {!editLocked ? (
        <div className="hub-cws-exam-form">
          <HubPrescriptionItemForm
            draft={draft}
            onChange={setDraft}
            onAdd={() => void add()}
            clinicId={clinicId}
            canCreateLookups={!readOnly}
            disabled={editLocked || savingItem}
            labeled
            editing={editingIndex != null}
            onCancelEdit={cancelEdit}
          />
        </div>
      ) : canonicalRx?.status === 'issued' ? (
        <p className="hub-rx-locked-note">
          Receita emitida — edição bloqueada. Reemita uma nova versão ou revogue no histórico.
        </p>
      ) : null}

      {issueBlockReason ? (
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
        <div className="hub-clinic-records__panel hub-rx-panel" style={{ marginBottom: 16 }}>
          <div className="hub-rx-panel__head">
            <strong>Receita deste atendimento</strong>
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
                      : 'Abrir PDF simples da receita'
                }
                onClick={() => void downloadPdf(latestDocumentId)}
              >
                {downloadingPdf ? 'Abrindo PDF…' : 'Abrir PDF'}
              </button>
            </div>
          </div>

          <div className="hub-cws-exam-table-wrap">
            <table className="hub-cws-exam-table">
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Posologia</th>
                  <th>Duração</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rxItems.map((it, idx) => (
                  <tr
                    key={it.id ?? `${canonicalRx.id}-${idx}`}
                    className={editingIndex === idx ? 'hub-cws-rx-item--editing' : undefined}
                  >
                    <td>
                      <strong>{it.medication_name}</strong>
                      {it.use_route ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          {it.use_route}
                          {it.presentation ? ` · ${it.presentation}` : ''}
                          {it.concentration || it.dosage ? ` · ${it.concentration || it.dosage}` : ''}
                        </div>
                      ) : it.presentation || it.concentration || it.dosage ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          {[it.presentation, it.concentration || it.dosage].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                      {it.instructions ? (
                        <div className="hub-clientes__muted" style={{ fontSize: 12 }}>
                          {it.instructions}
                        </div>
                      ) : null}
                    </td>
                    <td className="hub-clientes__muted">
                      {it.posology || it.frequency || '—'}
                      {it.quantity ? (
                        <div style={{ fontSize: 12 }}>{it.quantity}</div>
                      ) : null}
                    </td>
                    <td className="hub-clientes__muted">{it.duration?.trim() || '—'}</td>
                    <td>
                      {!editLocked ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--sm"
                            onClick={() => startEdit(idx)}
                            disabled={editingIndex === idx}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--sm hub-clientes__btn--danger-outline"
                            onClick={() => void removeItemAt(idx)}
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!editLocked ? (
            <div className="hub-cws-field-grid" style={{ marginTop: 12 }}>
              <div className="hub-clinic-field hub-cws-field-tight">
                <label htmlFor="rx_notes">Observações da receita</label>
                <input
                  id="rx_notes"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Orientações gerais, alertas de administração…"
                />
              </div>
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
      ) : hideEmptyState ? null : (
        <p className="hub-cws-exam-empty">Nenhum medicamento neste atendimento ainda.</p>
      )}

      {caseLinkedOthers.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <span className="hub-clientes__muted" style={{ fontSize: 12 }}>
            Outras receitas do mesmo caso (outros atendimentos)
          </span>
          <ul className="hub-clinic-records__list">
            {caseLinkedOthers.map((p) => (
              <li key={p.id}>
                {(p.items ?? []).map((it) => it.medication_name).join(', ') || 'Receita'}
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
