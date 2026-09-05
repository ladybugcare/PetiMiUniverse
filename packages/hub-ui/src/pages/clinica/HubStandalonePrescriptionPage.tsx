import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Coins, Link2, Pill, Send } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubSearchableCombobox, type HubComboboxOption } from '../../components/HubSearchableCombobox';
import {
  HubPrescriptionItemForm,
  emptyPrescriptionItemDraft,
  prescriptionItemToDraft,
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
  type HubPrescriptionDocumentRow,
  type HubPrescriptionItem,
} from '../../api/hubClinicalApi';
import { hubComandaApi } from '../../api/hubComandaApi';
import { hubGuardiansApi } from '../../api/hubGuardiansApi';
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
    hub_inventory_item_id: null,
    administration: 'home_use' as const,
    use_route: draft.use_route.trim() || null,
  };
}

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
  const presetCaseId = searchParams.get('caseId')?.trim() || '';
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
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
  const [caseLink, setCaseLink] = useState<ClinicalCaseLinkValue>(
    presetCaseId ? { hub_case_id: presetCaseId } : {},
  );
  const [hasActiveCases, setHasActiveCases] = useState(false);
  const [linkingCase, setLinkingCase] = useState(false);
  const [caseLinkedId, setCaseLinkedId] = useState<string | null>(presetCaseId || null);
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
        hub_case_id: presetCaseId || null,
        hub_staff_member_id: staffId,
        notes: notes.trim() || null,
        items: [firstItem],
      });
      setPrescription(res.prescription);
      return res.prescription;
    },
    [clinicId, petId, staffId, prescription, notes, presetCaseId],
  );

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(emptyPrescriptionItemDraft());
  };

  const startEdit = (index: number) => {
    if (!prescription || issued) return;
    const it = (prescription.items ?? [])[index];
    if (!it) return;
    setEditingIndex(index);
    setDraft(prescriptionItemToDraft(it));
  };

  const addItem = async () => {
    if (!draft.medication_name.trim() || issued) return;
    setSaving(true);
    try {
      if (editingIndex != null && prescription?.id && clinicId) {
        const list = [...(prescription.items ?? [])];
        if (editingIndex < 0 || editingIndex >= list.length) return;
        list[editingIndex] = {
          ...list[editingIndex],
          ...draftToCreateItem(draft),
        };
        const res = await hubClinicalApi.patchPrescription(prescription.id, {
          clinic_id: clinicId,
          items: list.map(prescriptionItemToPayload),
        });
        setPrescription(res.prescription);
        setEditingIndex(null);
        setDraft(emptyPrescriptionItemDraft());
        showSuccess('Medicamento atualizado');
        return;
      }
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
      if (editingIndex === index) {
        cancelEdit();
      } else if (editingIndex != null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
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

  const vetOptions = useMemo((): HubComboboxOption[] => {
    const withCrmvOrVet = staffList.filter(
      (s) => s.professional_kind === 'vet' || Boolean(s.crmv?.trim()),
    );
    const list = withCrmvOrVet.length ? withCrmvOrVet : staffList;
    return [...list]
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
      .map((s) => ({
        value: s.id,
        label: s.crmv
          ? `${s.full_name} · CRMV ${s.crmv}${s.crmv_uf ? `/${s.crmv_uf}` : ''}`
          : s.full_name,
      }));
  }, [staffList]);

  if (permLoading || loadingPet) {
    return (
      <div className="hub-standalone-rx">
        <HubLoading label="Carregando…" />
      </div>
    );
  }

  if (!canRead) {
    return <p className="hub-clientes__muted hub-standalone-rx">Sem permissão para receitas clínicas.</p>;
  }

  if (!petId || !pet) {
    return (
      <div className="hub-standalone-rx">
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
      <header className="hub-standalone-rx__topbar">
        <div>
          <button
            type="button"
            className="hub-standalone-rx__back"
            onClick={() =>
              navigate(presetCaseId ? `/hub/clinica/casos/${presetCaseId}` : `/hub/pets/${pet.id}`)
            }
          >
            <ArrowLeft size={16} aria-hidden />
            {presetCaseId ? 'Voltar ao caso' : `Ficha de ${pet.name}`}
          </button>
          <h1 className="hub-standalone-rx__topbar-title">
            <Pill size={20} aria-hidden /> Nova receita — {pet.name}
          </h1>
          <p className="hub-standalone-rx__topbar-subtitle">
            {presetCaseId
              ? 'Receita complementar neste caso, sem precisar abrir outro atendimento.'
              : 'Receita avulsa sem atendimento completo. Depois da emissão, vincule a um caso e cobre se quiser.'}
          </p>
        </div>
        <div className="hub-standalone-rx__topbar-actions">
          {!issued && canWrite ? (
            <button
              type="button"
              className="hub-standalone-rx__btn hub-standalone-rx__btn--primary"
              disabled={issuing || !staffId || items.length === 0}
              onClick={() => void issueValidatable()}
            >
              <Send size={16} aria-hidden />
              {issuing ? 'Emitindo…' : 'Emitir receita validável'}
            </button>
          ) : null}
          {issued ? <span className="hub-rx-badge hub-rx-badge--issued">Emitida</span> : null}
        </div>
      </header>

      {!canWrite ? (
        <p className="hub-clientes__muted">Sem permissão para criar ou emitir receitas.</p>
      ) : (
        <div className="hub-standalone-rx__grid">
          <div className="hub-standalone-rx__main">
            <section className="hub-standalone-rx__card">
              <div className="hub-standalone-rx__card-header">
                <div>
                  <h2 className="hub-standalone-rx__card-title">1. Responsável</h2>
                  <p className="hub-standalone-rx__card-subtitle">
                    Veterinário(a) que assina a receita emitida.
                  </p>
                </div>
              </div>
              <div className="hub-standalone-rx__field">
                <label className="hub-standalone-rx__label" htmlFor="standalone-rx-vet">
                  Veterinária(o) *
                </label>
                <HubSearchableCombobox
                  id="standalone-rx-vet"
                  className="hub-standalone-rx__combobox"
                  options={vetOptions}
                  value={staffId}
                  onChange={setStaffId}
                  placeholder="Selecionar…"
                  searchPlaceholder="Buscar profissional…"
                  disabled={issued}
                  allowCreate={false}
                  clearable={false}
                  ariaLabel="Veterinário responsável"
                />
              </div>
            </section>

            <section className="hub-standalone-rx__card">
              <div className="hub-standalone-rx__card-header">
                <div>
                  <h2 className="hub-standalone-rx__card-title">
                    {editingIndex != null ? '2. Editar medicamento' : '2. Incluir medicamento'}
                  </h2>
                  <p className="hub-standalone-rx__card-subtitle">
                    Use o catálogo da clínica ou adicione uma opção nova na hora.
                  </p>
                </div>
              </div>
              {!issued ? (
                <HubPrescriptionItemForm
                  draft={draft}
                  onChange={setDraft}
                  onAdd={() => void addItem()}
                  clinicId={clinicId}
                  canCreateLookups={canWrite}
                  disabled={saving || !staffId}
                  labeled
                  editing={editingIndex != null}
                  onCancelEdit={cancelEdit}
                />
              ) : (
                <p className="hub-rx-locked-note">Prescrição emitida — edição de itens bloqueada.</p>
              )}
            </section>

            <section className="hub-standalone-rx__card">
              <div className="hub-standalone-rx__card-header">
                <div>
                  <h2 className="hub-standalone-rx__card-title">3. Medicamentos ({items.length})</h2>
                  <p className="hub-standalone-rx__card-subtitle">
                    Itens que entram no PDF e no link validável.
                  </p>
                </div>
              </div>
              {items.length === 0 ? (
                <p className="hub-standalone-rx__empty">Nenhum medicamento ainda. Inclua pelo menos um acima.</p>
              ) : (
                <ul className="hub-standalone-rx__med-list">
                  {items.map((it, idx) => (
                    <li
                      key={`${it.medication_name}-${idx}`}
                      className={`hub-standalone-rx__med-row${editingIndex === idx ? ' hub-standalone-rx__med-row--editing' : ''}`}
                    >
                      <div className="hub-standalone-rx__med-main">
                        <span className="hub-standalone-rx__med-index">{idx + 1}</span>
                        <div>
                          <div className="hub-standalone-rx__med-name">{it.medication_name}</div>
                          <div className="hub-standalone-rx__med-meta">{formatPrescriptionItemMeta(it)}</div>
                        </div>
                      </div>
                      {!issued ? (
                        <div className="hub-standalone-rx__med-actions">
                          <button
                            type="button"
                            className="hub-standalone-rx__btn hub-standalone-rx__btn--outline hub-standalone-rx__btn--sm"
                            onClick={() => startEdit(idx)}
                            disabled={saving || editingIndex === idx}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="hub-standalone-rx__btn hub-standalone-rx__btn--ghost hub-standalone-rx__btn--sm"
                            onClick={() => void removeItemAt(idx)}
                            disabled={saving}
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="hub-standalone-rx__card">
              <div className="hub-standalone-rx__card-header">
                <div>
                  <h2 className="hub-standalone-rx__card-title">4. Observações da receita</h2>
                  <p className="hub-standalone-rx__card-subtitle">
                    Orientações gerais salvas na emissão (opcional).
                  </p>
                </div>
              </div>
              <textarea
                id="standalone-rx-notes"
                className="hub-standalone-rx__textarea"
                rows={3}
                value={notes}
                disabled={issued}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: retornar em 7 dias se não houver melhora…"
              />
            </section>
          </div>

          <aside className="hub-standalone-rx__sidebar" aria-labelledby="standalone-rx-after">
            <section className="hub-standalone-rx__card hub-standalone-rx__card--sidebar">
              <div className="hub-standalone-rx__card-header">
                <div>
                  <h2 id="standalone-rx-after" className="hub-standalone-rx__card-title">
                    <Link2 size={15} aria-hidden /> Depois da emissão
                  </h2>
                  <p className="hub-standalone-rx__card-subtitle">
                    Vincular ao prontuário e cobrar só se fizer sentido.
                  </p>
                </div>
              </div>

              {!(postIssueStep || issued) ? (
                <p className="hub-standalone-rx__aside-empty">
                  Emita a receita com o botão no topo. Aqui liberam o vínculo ao caso, a cobrança e o link.
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
                          className="hub-standalone-rx__btn hub-standalone-rx__btn--primary hub-standalone-rx__btn--sm"
                          disabled={linkingCase}
                          onClick={() => void linkCase()}
                        >
                          {linkingCase ? 'Vinculando…' : hasActiveCases ? 'Vincular ao caso' : 'Criar caso e vincular'}
                        </button>
                        <button
                          type="button"
                          className="hub-standalone-rx__btn hub-standalone-rx__btn--ghost hub-standalone-rx__btn--sm"
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
                        className="hub-standalone-rx__btn hub-standalone-rx__btn--outline hub-standalone-rx__btn--sm"
                        disabled={openingComanda}
                        onClick={() => void openComanda()}
                      >
                        <Coins size={14} aria-hidden /> {openingComanda ? 'Abrindo…' : 'Cobrar (abrir comanda)'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="hub-standalone-rx__btn hub-standalone-rx__btn--ghost hub-standalone-rx__btn--sm"
                      onClick={() => setIssuePanelOpen(true)}
                    >
                      Ver link / código da receita
                    </button>
                    {presetCaseId ? (
                      <Link
                        to={`/hub/clinica/casos/${presetCaseId}`}
                        className="hub-standalone-rx__btn hub-standalone-rx__btn--ghost hub-standalone-rx__btn--sm"
                      >
                        Voltar ao caso
                      </Link>
                    ) : (
                      <Link
                        to={`/hub/pets/${pet.id}`}
                        className="hub-standalone-rx__btn hub-standalone-rx__btn--ghost hub-standalone-rx__btn--sm"
                      >
                        Voltar ao pet
                      </Link>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="hub-standalone-rx__card hub-standalone-rx__card--sidebar hub-standalone-rx__summary">
              <p className="hub-standalone-rx__summary-label">Resumo</p>
              <dl className="hub-standalone-rx__summary-dl">
                <div>
                  <dt>Pet</dt>
                  <dd>{pet.name}</dd>
                </div>
                <div>
                  <dt>Medicamentos</dt>
                  <dd>{items.length}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{issued ? 'Emitida' : items.length ? 'Pronta para emitir' : 'Em montagem'}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
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
