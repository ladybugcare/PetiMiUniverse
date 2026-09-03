import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Coins, Link2, Pill } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import {
  HubPrescriptionItemForm,
  emptyPrescriptionItemDraft,
  type PrescriptionItemDraft,
} from '../../components/clinical/HubPrescriptionItemForm';
import { HubPrescriptionIssuePanel } from '../../components/clinical/HubPrescriptionIssuePanel';
import ClinicalCaseLinkFields, {
  isCaseLinkResolved,
  type ClinicalCaseLinkValue,
} from '../../components/clinical/ClinicalCaseLinkFields';
import {
  hubClinicalApi,
  hubClinicalCasesApi,
  openBlankPdfPreviewTab,
  openHubPrescriptionPdf,
  type HubPrescription,
  type HubPrescriptionAdministration,
  type HubPrescriptionDocumentRow,
  type HubPrescriptionItem,
} from '../../api/hubClinicalApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
import { hubInventoryApi, type HubInventoryItem } from '../../api/hubInventoryApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { useMyStaffMember } from '../../hooks/useMyStaffMember';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { normalizeBrPhone } from '../../utils/whatsappLink';
import { formatPrescriptionItemMeta } from './clinicalDisplay';
import {
  buildPrescriptionWhatsAppMessage,
  openPrescriptionWhatsApp,
} from './hubPrescriptionShareUtils';
import '../clientes/clientes.css';
import './clinica-page.css';

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

function prescriptionItemToPayload(it: HubPrescriptionItem) {
  const administration: HubPrescriptionAdministration =
    it.administration === 'administered_in_clinic' ? 'administered_in_clinic' : 'home_use';
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

/**
 * Fluxo de receita avulsa: pet + veterinário, sem exigir atendimento completo.
 * Após emitir, permite vincular a caso (existente/novo) ou deixar para depois, e opcionalmente abrir comanda.
 */
const HubStandalonePrescriptionPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get('petId')?.trim() || '';
  const { showError, showSuccess } = useAlert();
  const { hasPermission, loading: permLoading } = usePermissions();
  const canWrite = hasPermission('hub.clinic.write');
  const canRead = hasPermission('hub.clinic.read');
  const canCreateReceivable = hasPermission('hub.receivables.create');
  const { myStaffMember, staffList, loading: myStaffLoading } = useMyStaffMember();

  const [pet, setPet] = useState<HubPet | null>(null);
  const [loadingPet, setLoadingPet] = useState(true);
  const [staffId, setStaffId] = useState('');
  const [draft, setDraft] = useState<PrescriptionItemDraft>(emptyPrescriptionItemDraft);
  const [medicationItems, setMedicationItems] = useState<HubInventoryItem[]>([]);
  const [notes, setNotes] = useState('');
  const [prescription, setPrescription] = useState<HubPrescription | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issuePanelOpen, setIssuePanelOpen] = useState(false);
  const [issuePanelLoading, setIssuePanelLoading] = useState(false);
  const [issuePanelError, setIssuePanelError] = useState<string | null>(null);
  const [issuedDoc, setIssuedDoc] = useState<HubPrescriptionDocumentRow | null>(null);
  const [issuedPublicUrl, setIssuedPublicUrl] = useState<string | null>(null);
  const [issuedHashShort, setIssuedHashShort] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [postIssueStep, setPostIssueStep] = useState(false);
  const [caseLink, setCaseLink] = useState<ClinicalCaseLinkValue>({});
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [linkingCase, setLinkingCase] = useState(false);
  const [caseLinkedId, setCaseLinkedId] = useState<string | null>(null);
  const [openingComanda, setOpeningComanda] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState<string | null>(null);

  useEffect(() => {
    if (!clinicId || !petId) {
      setPet(null);
      setLoadingPet(false);
      return;
    }
    setLoadingPet(true);
    void hubPetsApi
      .list(clinicId, true)
      .then((r) => setPet(r.pets.find((p) => p.id === petId) ?? null))
      .catch(() => setPet(null))
      .finally(() => setLoadingPet(false));
  }, [clinicId, petId]);

  useEffect(() => {
    const guardianId = pet?.primary_guardian?.guardian_id;
    if (!clinicId || !guardianId) {
      setGuardianPhone(null);
      return;
    }
    void hubGuardiansApi
      .getById(guardianId, clinicId)
      .then((r) => setGuardianPhone(r.guardian.phone))
      .catch(() => setGuardianPhone(null));
  }, [clinicId, pet?.primary_guardian?.guardian_id]);

  useEffect(() => {
    if (staffId || myStaffLoading) return;
    const preferred =
      myStaffMember &&
      (myStaffMember.professional_kind === 'vet' || Boolean(myStaffMember.crmv?.trim()))
        ? myStaffMember.id
        : '';
    if (preferred) setStaffId(preferred);
  }, [myStaffMember, myStaffLoading, staffId]);

  useEffect(() => {
    if (!clinicId) return;
    void hubInventoryApi.items
      .list(clinicId, false, 'medication')
      .then((r) => setMedicationItems(r.items ?? []))
      .catch(() => setMedicationItems([]));
  }, [clinicId]);

  const issued = prescription?.status === 'issued';
  const items = prescription?.items ?? [];

  const ensurePrescription = useCallback(
    async (firstItem: ReturnType<typeof draftToCreateItem>) => {
      if (!clinicId || !petId || !staffId) throw new Error('Selecione o veterinário responsável');
      if (prescription?.id) {
        if (prescription.status === 'issued') {
          throw new Error('Receita já emitida — não é possível adicionar itens');
        }
        const nextItems = [...(prescription.items ?? []).map(prescriptionItemToPayload), firstItem];
        const res = await hubClinicalApi.patchPrescription(prescription.id, {
          clinic_id: clinicId,
          hub_staff_member_id: staffId,
          notes: notes.trim() || null,
          items: nextItems,
        });
        setPrescription(res.prescription);
        return res.prescription;
      }
      const res = await hubClinicalApi.createPrescription({
        clinic_id: clinicId,
        pet_id: petId,
        hub_staff_member_id: staffId,
        notes: notes.trim() || null,
        items: [firstItem],
      });
      setPrescription(res.prescription);
      return res.prescription;
    },
    [clinicId, petId, staffId, prescription, notes],
  );

  const addItem = async () => {
    if (!draft.medication_name.trim() || issued) return;
    setSaving(true);
    try {
      await ensurePrescription(draftToCreateItem(draft));
      setDraft(emptyPrescriptionItemDraft());
      showSuccess('Medicamento incluído');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao incluir medicamento');
    } finally {
      setSaving(false);
    }
  };

  const removeItemAt = async (index: number) => {
    if (!clinicId || !prescription || issued) return;
    const list = [...(prescription.items ?? [])];
    if (list.length <= 1) {
      showError('A receita precisa ter pelo menos um medicamento.');
      return;
    }
    list.splice(index, 1);
    setSaving(true);
    try {
      const res = await hubClinicalApi.patchPrescription(prescription.id, {
        clinic_id: clinicId,
        items: list.map(prescriptionItemToPayload),
      });
      setPrescription(res.prescription);
      showSuccess('Item removido');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover item');
    } finally {
      setSaving(false);
    }
  };

  const issueValidatable = async () => {
    if (!clinicId || !staffId) {
      showError('Selecione o veterinário responsável antes de emitir.');
      return;
    }
    if (!items.length) {
      showError('Adicione ao menos um medicamento antes de gerar a receita.');
      return;
    }
    if (!prescription?.id) return;

    setIssuePanelError(null);
    setIssuePanelOpen(true);
    setIssuePanelLoading(true);
    setIssuing(true);
    try {
      if (!issued) {
        await hubClinicalApi.patchPrescription(prescription.id, {
          clinic_id: clinicId,
          hub_staff_member_id: staffId,
          notes: notes.trim() || null,
        });
      }
      const res = await hubClinicalApi.issuePrescriptionDocument(prescription.id, {
        clinic_id: clinicId,
        issued_by: staffId,
      });
      setIssuedDoc(res.document);
      setIssuedPublicUrl(res.public_url ?? res.document.public_url ?? res.document.validation_url ?? null);
      setIssuedHashShort(res.content_hash_short ?? res.document.content_hash_short ?? null);
      setPrescription((prev) => (prev ? { ...prev, status: 'issued' } : prev));
      setPostIssueStep(true);
      showSuccess('Receita validável emitida');
    } catch (e: unknown) {
      const message = (e as Error)?.message || 'Erro ao emitir receita validável';
      setIssuePanelError(message);
      showError(message);
    } finally {
      setIssuePanelLoading(false);
      setIssuing(false);
    }
  };

  const downloadPdf = async () => {
    if (!clinicId || !prescription) return;
    const pdfPreviewWindow = openBlankPdfPreviewTab();
    setDownloadingPdf(true);
    try {
      const mode = await openHubPrescriptionPdf(
        prescription.id,
        clinicId,
        issuedDoc?.id,
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

  const linkCase = async () => {
    if (!clinicId || !prescription || !petId) return;
    if (hasActiveCases && !isCaseLinkResolved(caseLink, hasActiveCases)) {
      showError('Escolha um caso existente ou crie um novo.');
      return;
    }
    setLinkingCase(true);
    try {
      let caseId = caseLink.hub_case_id ?? null;
      if (caseLink.create_new_case || (!hasActiveCases && !caseId)) {
        const title =
          caseLink.new_case_title?.trim() ||
          `Receita — ${pet?.name ?? 'pet'} — ${new Date().toLocaleDateString('pt-BR')}`;
        const { case: created } = await hubClinicalCasesApi.create({
          clinic_id: clinicId,
          pet_id: petId,
          title,
          unit_id: unitId ?? null,
          guardian_id_snapshot: pet?.primary_guardian?.guardian_id ?? null,
          primary_veterinarian_id: staffId || null,
        });
        caseId = created.id;
      }
      if (!caseId) {
        showError('Não foi possível determinar o caso clínico.');
        return;
      }
      const res = await hubClinicalApi.patchPrescription(prescription.id, {
        clinic_id: clinicId,
        hub_case_id: caseId,
      });
      setPrescription(res.prescription);
      setCaseLinkedId(caseId);
      showSuccess('Receita vinculada ao caso clínico');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao vincular caso');
    } finally {
      setLinkingCase(false);
    }
  };

  const skipCaseLink = () => {
    setCaseLinkedId(null);
    showSuccess('Você pode vincular esta receita a um caso depois, no prontuário.');
  };

  const openComanda = async () => {
    if (!clinicId || !pet) return;
    const guardianId = pet.primary_guardian?.guardian_id;
    if (!guardianId) {
      showError('Este pet não tem tutor principal cadastrado.');
      return;
    }
    setOpeningComanda(true);
    try {
      const detail = await hubComandaApi.openComanda({
        clinic_id: clinicId,
        origin_type: 'manual',
        guardian_id: guardianId,
        unit_id: unitId ?? undefined,
        pet_id: pet.id,
        hub_case_id: caseLinkedId ?? prescription?.hub_case_id ?? null,
        manual_lines: [],
      });
      const comandaId = (detail.comanda as Record<string, unknown>).id as string;
      navigate(`/hub/caixa/comanda/${comandaId}`);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao abrir comanda');
    } finally {
      setOpeningComanda(false);
    }
  };

  const shareWhatsApp = () => {
    const link =
      issuedPublicUrl ||
      issuedDoc?.validation_url ||
      (issuedDoc?.public_url ? hubClinicalApi.publicPrescriptionLink(issuedDoc.public_url) : '');
    if (!link) {
      showError('Link da receita ainda não está disponível.');
      return;
    }
    const message = buildPrescriptionWhatsAppMessage({
      tutorName: pet?.primary_guardian?.guardian_name,
      petName: pet?.name,
      publicLink: link,
    });
    const href = openPrescriptionWhatsApp(guardianPhone, message);
    if (!href) {
      showError('Cadastre o telefone do tutor para enviar pelo WhatsApp.');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const whatsAppReady = Boolean(normalizeBrPhone(guardianPhone));

  const vetOptions = useMemo(() => {
    const withCrmvOrVet = staffList.filter(
      (s) => s.professional_kind === 'vet' || Boolean(s.crmv?.trim()),
    );
    const list = withCrmvOrVet.length ? withCrmvOrVet : staffList;
    return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'));
  }, [staffList]);

  if (permLoading || loadingPet) {
    return (
      <div className="hub-clinic-page__pad">
        <HubLoading label="Carregando…" />
      </div>
    );
  }

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para receitas clínicas.</p>;
  }

  if (!petId || !pet) {
    return (
      <div className="hub-clinic-page__pad">
        <p className="hub-clientes__muted">Pet não encontrado. Abra a receita a partir da ficha do pet.</p>
        <Link to="/hub/pets" className="hub-clientes__link">
          Voltar aos pets
        </Link>
      </div>
    );
  }

  if (!clinicId) {
    return <Navigate to="/hub/pets" replace />;
  }

  return (
    <div className="hub-standalone-rx">
      <div className="hub-standalone-rx__top">
        <button
          type="button"
          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm hub-cws-back"
          onClick={() => navigate(`/hub/pets/${pet.id}`)}
        >
          <ArrowLeft size={16} aria-hidden /> Voltar à ficha de {pet.name}
        </button>

        <header className="hub-standalone-rx__header">
          <div>
            <p className="hub-standalone-rx__kicker">Receita avulsa</p>
            <h1 className="hub-standalone-rx__title">
              <Pill size={20} aria-hidden /> Criar receita — {pet.name}
            </h1>
          </div>
          <p className="hub-clientes__muted hub-standalone-rx__lead">
            Pet + veterinário, sem atendimento completo. Depois vincule a um caso e cobre se quiser.
          </p>
        </header>
      </div>

      {!canWrite ? (
        <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para criar ou emitir receitas.</p>
      ) : (
        <>
          <div className="hub-standalone-rx__grid">
            <section className="hub-standalone-rx__col">
              <label className="hub-clientes__label" htmlFor="standalone-rx-vet">
                Veterinária(o) responsável *
              </label>
              <select
                id="standalone-rx-vet"
                className="hub-clientes__input"
                value={staffId}
                disabled={issued}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Selecionar…</option>
                {vetOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.crmv ? ` · CRMV ${s.crmv}${s.crmv_uf ? `/${s.crmv_uf}` : ''}` : ''}
                  </option>
                ))}
              </select>

              {!issued ? (
                <HubPrescriptionItemForm
                  draft={draft}
                  onChange={setDraft}
                  onAdd={() => void addItem()}
                  medicationItems={medicationItems}
                  disabled={saving || !staffId}
                  compact
                />
              ) : (
                <p className="hub-rx-locked-note">Prescrição emitida — edição de itens bloqueada.</p>
              )}

              {items.length > 0 ? (
                <div className="hub-clinic-records__panel hub-rx-panel hub-standalone-rx__meds">
                  <div className="hub-rx-panel__head">
                    <strong>Medicamentos ({items.length})</strong>
                    {issued ? <span className="hub-rx-badge hub-rx-badge--issued">Emitida</span> : null}
                  </div>
                  <ul className="hub-cws-rx-list">
                    {items.map((it, idx) => (
                      <li key={`${it.medication_name}-${idx}`} className="hub-cws-rx-item hub-cws-rx-item--compact">
                        <div>
                          <div className="hub-cws-rx-item__name">{it.medication_name}</div>
                          <div className="hub-cws-rx-item__meta">{formatPrescriptionItemMeta(it)}</div>
                        </div>
                        {!issued ? (
                          <button
                            type="button"
                            className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                            onClick={() => void removeItemAt(idx)}
                            disabled={saving}
                          >
                            Remover
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <label className="hub-clientes__label" htmlFor="standalone-rx-notes">
                Observações da receita
              </label>
              <textarea
                id="standalone-rx-notes"
                className="hub-clientes__input"
                rows={2}
                value={notes}
                disabled={issued}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional — salvas na emissão"
              />
            </section>

            <aside className="hub-standalone-rx__aside" aria-labelledby="standalone-rx-after">
              <h2 id="standalone-rx-after" className="hub-standalone-rx__after-title">
                <Link2 size={16} aria-hidden /> Depois da emissão
              </h2>
              <p className="hub-clientes__muted hub-standalone-rx__aside-lead">
                Vincule a um caso clínico para organizar o prontuário (opcional) e cobre só se fizer sentido.
              </p>

              {!(postIssueStep || issued) ? (
                <p className="hub-standalone-rx__aside-empty">
                  Emita a receita à esquerda. Este painel libera o vínculo ao caso, a cobrança e o acesso ao link.
                </p>
              ) : (
                <>
                  {caseLinkedId || prescription?.hub_case_id ? (
                    <p className="hub-standalone-rx__aside-linked">
                      Vinculada ao caso.{' '}
                      <Link
                        to={`/hub/clinica/casos/${caseLinkedId ?? prescription?.hub_case_id}`}
                        className="hub-clientes__link"
                      >
                        Abrir caso
                      </Link>
                    </p>
                  ) : (
                    <div className="hub-standalone-rx__aside-case">
                      <ClinicalCaseLinkFields
                        clinicId={clinicId}
                        petId={petId}
                        value={caseLink}
                        onChange={setCaseLink}
                        onHasActiveCases={setHasActiveCases}
                        disabled={linkingCase}
                      />
                      <div className="hub-standalone-rx__after-actions">
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                          disabled={linkingCase}
                          onClick={() => void linkCase()}
                        >
                          {linkingCase ? 'Vinculando…' : hasActiveCases ? 'Vincular ao caso' : 'Criar caso e vincular'}
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                          disabled={linkingCase}
                          onClick={skipCaseLink}
                        >
                          Vincular depois
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="hub-standalone-rx__after-actions hub-standalone-rx__after-actions--stack">
                    {canCreateReceivable ? (
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--sm"
                        disabled={openingComanda}
                        onClick={() => void openComanda()}
                      >
                        <Coins size={14} aria-hidden /> {openingComanda ? 'Abrindo…' : 'Cobrar (abrir comanda)'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      onClick={() => setIssuePanelOpen(true)}
                    >
                      Ver link / código da receita
                    </button>
                    <Link
                      to={`/hub/pets/${pet.id}`}
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    >
                      Voltar ao pet
                    </Link>
                  </div>
                </>
              )}
            </aside>
          </div>

          {!issued ? (
            <footer className="hub-standalone-rx__footer">
              <button
                type="button"
                className="hub-clientes__btn hub-clientes__btn--primary"
                disabled={issuing || !staffId || items.length === 0}
                onClick={() => void issueValidatable()}
              >
                {issuing ? 'Emitindo…' : 'Emitir receita validável'}
              </button>
            </footer>
          ) : null}
        </>
      )}

      <HubPrescriptionIssuePanel
        open={issuePanelOpen}
        onClose={() => setIssuePanelOpen(false)}
        loading={issuePanelLoading}
        error={issuePanelError}
        document={issuedDoc}
        publicUrl={issuedPublicUrl}
        contentHashShort={issuedHashShort}
        onDownloadPdf={() => void downloadPdf()}
        downloading={downloadingPdf}
        onCopySuccess={(msg) => showSuccess(msg)}
        onCopyError={(msg) => showError(msg)}
        onShareWhatsApp={shareWhatsApp}
        whatsAppDisabled={!whatsAppReady}
        whatsAppDisabledReason="Cadastre o telefone do tutor para enviar pelo WhatsApp"
      />
    </div>
  );
};

export default HubStandalonePrescriptionPage;
