import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { useAlert } from '../../../components/AlertProvider';
import { HubLoading } from '../../../components/HubLoading';
import { useKeepContentLoad } from '../../../hooks/useKeepContentLoad';
import { HubDateField } from '../../../components/HubDateField';
import { HubTabs } from '../../../components/HubTabs';
import { formatYmd, parseIsoYmd } from '../../../utils/hubCalendar';
import {
  hubEncountersApi,
  hubVetCockpitApi,
  type DayBoardItem,
  type HubEncounterOperationalPhase,
  type VetCockpitPatientContext,
} from '../../../api/hubClinicalApi';
import CompleteEncounterCasePrompt from '../CompleteEncounterCasePrompt.tsx';
import {
  applyCaseAfterCompleteChoice,
  buildCaseAfterCompletePrompt,
  caseAfterCompleteSuccessMessage,
  type CaseAfterCompleteChoice,
  type CaseAfterCompletePrompt,
} from '../caseAfterCompletePrompt';
import { useMyStaffMember } from '../../../hooks/useMyStaffMember';
import { redirectAwayFromHub } from '../../../utils/redirectAwayFromHub';
import { getSelectedUnitId } from '../../../utils/useSelectedUnitId';
import { dayRangeIsoLocal } from '../../agenda/agendaFilters';
import type { NewAppointmentInitial } from '../../agenda/NewAppointmentModal';
import type { CareLocationValue } from '../../../components/CareLocationFields';
import StartEncounterModal from '../StartEncounterModal';
import ClinicWalkInPanel from '../ClinicWalkInPanel';
import HubClinicHospitalPage from '../HubClinicHospitalPage';
import HubClinicSurgeriesPage from '../HubClinicSurgeriesPage';
import VetCockpitHeader from './VetCockpitHeader';
import VetCockpitOpsSection from './VetCockpitOpsSection';
import VetCockpitHistory from './VetCockpitHistory';
import VetCockpitQueue from './VetCockpitQueue';
import VetCockpitPatientPanel, { type VetCockpitDrawerSection } from './VetCockpitPatientPanel';
import {
  cockpitEncounterPath,
  computeTurnSummary,
  formatCockpitDayLabel,
  itemKey,
  readStoredSelection,
  writeStoredSelection,
} from './vetCockpitUtils';
import '../clinica-page.css';
import '../../clientes/clientes.css';
import '../../../components/HubViewDateToolbar.css';
import './vet-cockpit.css';

const POLL_MS = 30_000;

type CockpitTab = 'hoje' | 'andamento' | 'historico';

const COCKPIT_TABS: Array<{ id: CockpitTab; label: string }> = [
  { id: 'hoje', label: 'Operação do dia' },
  { id: 'andamento', label: 'Cirurgias e internações' },
  { id: 'historico', label: 'Histórico' },
];

const HubVetCockpitPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { role: authRole } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { clinicId, myStaffMember, loading: staffLoading, linked } = useMyStaffMember();
  const canWrite = hasPermission('hub.clinic.write');
  const accessAllowed = hasPermission('hub.clinic.read');

  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<DayBoardItem[]>([]);
  const [selected, setSelected] = useState<DayBoardItem | null>(null);
  const [patientContext, setPatientContext] = useState<VetCockpitPatientContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [startModalItem, setStartModalItem] = useState<DayBoardItem | null>(null);
  const [startingEncounter, setStartingEncounter] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [casePrompt, setCasePrompt] = useState<CaseAfterCompletePrompt | null>(null);
  const [casePromptSaving, setCasePromptSaving] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [creatingWalkIn, setCreatingWalkIn] = useState(false);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [surgeryCreateOpen, setSurgeryCreateOpen] = useState(false);
  const [cockpitTab, setCockpitTab] = useState<CockpitTab>('hoje');
  const [dayOpsOpen, setDayOpsOpen] = useState(true);
  const [hospSectionOpen, setHospSectionOpen] = useState(true);
  const [surgSectionOpen, setSurgSectionOpen] = useState(true);
  const [opsPresetPetId, setOpsPresetPetId] = useState<string | null>(null);
  const [opsPresetCaseId, setOpsPresetCaseId] = useState<string | null>(null);
  const [badgeHints, setBadgeHints] = useState<
    Record<string, { examsAvailable?: boolean; rxDraft?: boolean; hospitalized?: boolean }>
  >({});

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);
  const staffId = myStaffMember?.id;
  const { loading, refreshing, begin, succeed, finish } = useKeepContentLoad(
    clinicId && staffId ? `${clinicId}:${staffId}` : null,
  );
  const contextPetIdRef = useRef<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!clinicId || !staffId) {
      setItems([]);
      finish();
      return;
    }
    begin();
    try {
      const res = await hubEncountersApi.dayBoard(clinicId, dayRange, { staffId });
      setItems(res.items ?? []);
      succeed();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar fila');
      setItems([]);
    } finally {
      finish();
    }
  }, [clinicId, staffId, dayRange, showError, begin, succeed, finish]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) redirectAwayFromHub(authRole as AppRole);
  }, [permLoading, accessAllowed, authRole]);

  /** Links de Internar/Cirurgia chegam no Consultório com ?admit=1 ou ?surgery=1. */
  useEffect(() => {
    const wantAdmit = searchParams.get('admit') === '1';
    const wantSurgery = searchParams.get('surgery') === '1';
    if (!wantAdmit && !wantSurgery) return;
    const qPet = searchParams.get('pet_id');
    const qCase = searchParams.get('hub_case_id');
    if (qPet) setOpsPresetPetId(qPet);
    if (qCase) setOpsPresetCaseId(qCase);
    if (wantAdmit) {
      setAdmitOpen(true);
      setHospSectionOpen(true);
      setCockpitTab('andamento');
    }
    if (wantSurgery) {
      setSurgeryCreateOpen(true);
      setSurgSectionOpen(true);
      setCockpitTab('andamento');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('admit');
    next.delete('surgery');
    next.delete('pet_id');
    next.delete('hub_case_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadQueue();
  }, [clinicId, accessAllowed, loadQueue]);

  useEffect(() => {
    if (!clinicId || !accessAllowed || !staffId) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadQueue();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadQueue();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [clinicId, accessAllowed, loadQueue, staffId]);

  useEffect(() => {
    if (items.length === 0) return;
    const stored = readStoredSelection();
    if (stored) {
      const hit = items.find((i) => itemKey(i) === stored);
      if (hit) {
        setSelected(hit);
        return;
      }
    }
    if (!selected) setSelected(items[0] ?? null);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPatientContext = useCallback(
    async (item: DayBoardItem) => {
      if (!clinicId || !item.pet_id) {
        setPatientContext(null);
        contextPetIdRef.current = null;
        return;
      }
      const keepContext = contextPetIdRef.current === item.pet_id;
      if (!keepContext) {
        setPatientContext(null);
        setContextLoading(true);
      }
      try {
        const ctx = await hubVetCockpitApi.patientContext(clinicId, {
          petId: item.pet_id,
          encounterId: item.encounter_id,
          appointmentId: item.appointment_id,
        });
        setPatientContext(ctx);
        contextPetIdRef.current = item.pet_id;
        if (item.pet_id) {
          setBadgeHints((prev) => ({
            ...prev,
            [item.pet_id!]: {
              examsAvailable: ctx.exams_grouped.available.length > 0,
              rxDraft: ctx.draft_prescriptions_count > 0,
              hospitalized: Boolean(ctx.active_hospitalization),
            },
          }));
        }
      } catch (e: unknown) {
        showError((e as Error)?.message || 'Erro ao carregar contexto do paciente');
        setPatientContext(null);
      } finally {
        setContextLoading(false);
      }
    },
    [clinicId, showError],
  );

  useEffect(() => {
    if (selected) void loadPatientContext(selected);
    else setPatientContext(null);
  }, [selected, loadPatientContext]);

  const handleSelect = (item: DayBoardItem) => {
    setSelected(item);
    writeStoredSelection(itemKey(item));
  };

  const openEncounter = (encounterId: string, section?: VetCockpitDrawerSection) => {
    navigate(cockpitEncounterPath(encounterId, section), { state: { from: 'cockpit' } });
  };

  const handleStartConsultation = () => {
    if (!selected) return;
    if (selected.encounter_id) {
      openEncounter(selected.encounter_id);
      return;
    }
    if (selected.appointment_id) {
      setStartModalItem(selected);
      return;
    }
    if (selected.surgery_id) {
      navigate(`/hub/clinica/cirurgias/${selected.surgery_id}`);
    }
  };

  const handleStartEncounter = async (
    item: DayBoardItem,
    opts: { hub_case_id?: string | null; create_new_case?: boolean; new_case_title?: string | null },
  ) => {
    if (!clinicId || !item.appointment_id) return;
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.openFromAppointment(clinicId, item.appointment_id, opts);
      setStartModalItem(null);
      await loadQueue();
      const updated: DayBoardItem = {
        ...item,
        kind: 'encounter',
        encounter_id: encounter.id,
        status: encounter.status,
        operational_phase: encounter.operational_phase,
      };
      setSelected(updated);
      openEncounter(encounter.id);
      showSuccess('Consulta iniciada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao iniciar atendimento');
    } finally {
      setStartingEncounter(false);
    }
  };

  const handleComplete = async () => {
    const encId = selected?.encounter_id ?? patientContext?.encounter?.id;
    if (!clinicId || !encId || !canWrite) return;
    setCompleting(true);
    try {
      const { encounter: enc } = await hubEncountersApi.complete(encId, clinicId);
      showSuccess('Atendimento finalizado');
      await loadQueue();

      const caseId = enc.case?.id ?? enc.hub_case_id ?? patientContext?.encounter?.hub_case_id;
      const hosp = patientContext?.active_hospitalization;
      const hasOpenHospitalization = Boolean(hosp && (!hosp.hub_case_id || hosp.hub_case_id === caseId));
      const pendingExamsCount = patientContext?.exams_grouped.awaiting.length ?? 0;
      const linkedCase =
        (patientContext?.active_case && patientContext.active_case.id === caseId
          ? patientContext.active_case
          : patientContext?.cases.find((c) => c.id === caseId)) ?? null;

      const prompt = buildCaseAfterCompletePrompt({
        caseId,
        status: enc.case?.status ?? linkedCase?.status,
        title: enc.case?.title ?? linkedCase?.title,
        chiefComplaint: enc.chief_complaint ?? patientContext?.chief_complaint,
        hasOpenHospitalization,
        pendingExamsCount,
      });
      setPatientContext(null);
      if (prompt) setCasePrompt(prompt);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao finalizar atendimento');
    } finally {
      setCompleting(false);
    }
  };

  const handleCaseAfterComplete = async (choice: CaseAfterCompleteChoice) => {
    if (!clinicId || !casePrompt) {
      setCasePrompt(null);
      return;
    }
    if (choice === 'keep_open') {
      setCasePrompt(null);
      return;
    }
    setCasePromptSaving(true);
    try {
      const result = await applyCaseAfterCompleteChoice(clinicId, casePrompt.caseId, choice);
      const msg = caseAfterCompleteSuccessMessage(result);
      if (msg) showSuccess(msg);
      setCasePrompt(null);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar o caso');
    } finally {
      setCasePromptSaving(false);
    }
  };

  const handleSetOperationalPhase = async (phase: HubEncounterOperationalPhase | null) => {
    const encId = selected?.encounter_id ?? patientContext?.encounter?.id;
    if (!clinicId || !encId || !canWrite) return;
    setPhaseBusy(true);
    try {
      await hubEncountersApi.patch(encId, { clinic_id: clinicId, operational_phase: phase });
      await loadQueue();
      if (selected) await loadPatientContext(selected);
      showSuccess(phase === 'awaiting_exams' ? 'Paciente enviado para exames' : phase === 'exams_returned' ? 'Retorno registrado' : 'Consulta retomada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar fase operacional');
    } finally {
      setPhaseBusy(false);
    }
  };

  const summary = useMemo(() => computeTurnSummary(items, selected), [items, selected]);

  const cursorIso = useMemo(() => formatYmd(cursor), [cursor]);

  const shiftCursor = (delta: number) => {
    setCursor((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const openAgendaForScheduling = useCallback(
    (initial: NewAppointmentInitial) => {
      setWalkInOpen(false);
      navigate('/hub/appointments', {
        state: { openClinicalCreate: true, clinicalIntakeInitial: initial },
      });
    },
    [navigate],
  );

  const createWalkIn = async (payload: {
    petId?: string | null;
    guardianId?: string | null;
    staffId?: string | null;
    complaint: string;
    hubServiceTypeId: string;
    entryKind: 'routine' | 'emergency';
    durationMinutes: number;
    careLocation?: CareLocationValue;
  }) => {
    if (!clinicId) return;
    setCreatingWalkIn(true);
    try {
      await hubEncountersApi.checkIn({
        clinic_id: clinicId,
        unit_id: getSelectedUnitId(),
        hub_service_type_id: payload.hubServiceTypeId,
        hub_staff_member_id: payload.staffId ?? staffId ?? null,
        pet_id: payload.petId ?? null,
        guardian_id: payload.guardianId ?? null,
        chief_complaint: payload.complaint.trim() || null,
        encounter_type: payload.entryKind === 'emergency' ? 'emergency' : 'consultation',
        care_location_kind: payload.careLocation?.care_location_kind ?? 'own_unit',
        hub_partner_clinic_id:
          payload.careLocation?.care_location_kind === 'partner_clinic'
            ? payload.careLocation.hub_partner_clinic_id
            : null,
      });
      setWalkInOpen(false);
      showSuccess('Encaixe registrado na agenda e na fila');
      await loadQueue();
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao registrar entrada na fila');
      throw e;
    } finally {
      setCreatingWalkIn(false);
    }
  };

  if (permLoading || !accessAllowed) {
    return (
      <div className="vet-cockpit-page__pad">
        <HubLoading variant="block" />
      </div>
    );
  }

  if (!clinicId) {
    return (
      <p className="hub-clientes__muted vet-cockpit-page__pad">
        Selecione uma clínica para acessar o consultório.
      </p>
    );
  }

  return (
    <div className="vet-cockpit-page">
      {!linked && !staffLoading ? (
        <div className="vet-cockpit-banner">
          <p>
            Seu usuário não está vinculado a um profissional na equipe. Peça à administração para associar seu login em{' '}
            <Link to="/hub/equipe" className="hub-clientes__link">
              Equipe
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="hub-view-date-toolbar vet-cockpit-toolbar">
        {cockpitTab === 'hoje' ? (
          <div className="hub-view-date-toolbar__nav-cluster">
            <button
              type="button"
              className="hub-view-date-toolbar__icon-btn"
              onClick={() => shiftCursor(-1)}
              aria-label="Dia anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="hub-view-date-toolbar__icon-btn"
              onClick={() => shiftCursor(1)}
              aria-label="Próximo dia"
            >
              <ChevronRight size={18} />
            </button>
            <HubDateField
              id="vet-cockpit-date"
              className="hub-view-date-toolbar__date-field"
              valueIso={cursorIso}
              onChangeIso={(iso) => {
                if (!iso) return;
                const parsed = parseIsoYmd(iso);
                if (parsed) setCursor(parsed);
              }}
              showTodayButton
            />
          </div>
        ) : (
          <p className="hub-clientes__muted" style={{ margin: 0 }}>
            {cockpitTab === 'historico'
              ? 'Atendimentos, cirurgias e internações já encerrados.'
              : 'O que ainda está aberto na clínica.'}
          </p>
        )}
        {canWrite ? (
          <div className="vet-cockpit-toolbar__actions" role="group" aria-label="Operação do dia">
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--primary"
              disabled={!linked}
              title={!linked ? 'Vincule seu usuário a um profissional na Equipe' : undefined}
              onClick={() => {
                setCockpitTab('hoje');
                setWalkInOpen(true);
              }}
            >
              Novo atendimento
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={() => {
                setOpsPresetPetId(null);
                setOpsPresetCaseId(null);
                setAdmitOpen(true);
                setHospSectionOpen(true);
                setCockpitTab('andamento');
              }}
            >
              Internar
            </button>
            <button
              type="button"
              className="hub-clientes__btn hub-clientes__btn--ghost"
              onClick={() => {
                setOpsPresetPetId(null);
                setOpsPresetCaseId(null);
                setSurgeryCreateOpen(true);
                setSurgSectionOpen(true);
                setCockpitTab('andamento');
              }}
            >
              Nova cirurgia
            </button>
          </div>
        ) : null}
      </div>

      <HubTabs
        className="vet-cockpit-tabs"
        ariaLabel="Áreas do consultório"
        variant="page"
        activeId={cockpitTab}
        onTabChange={(id) => setCockpitTab(id as CockpitTab)}
        items={COCKPIT_TABS}
      />

      <div className="vet-cockpit-ops-sections">
        {cockpitTab === 'hoje' ? (
        <VetCockpitOpsSection
          id="dia"
          title="Operação do dia"
          open={dayOpsOpen}
          onToggle={() => setDayOpsOpen((v) => !v)}
        >
          <VetCockpitHeader summary={summary} dateLabel={formatCockpitDayLabel(cursor, summary.total)} />
          <div className="vet-cockpit-layout">
            <VetCockpitQueue
              items={items}
              selectedKey={selected ? itemKey(selected) : null}
              onSelect={handleSelect}
              loading={loading || staffLoading}
              refreshing={refreshing}
              badgeHints={badgeHints}
            />
            <VetCockpitPatientPanel
              item={selected}
              context={patientContext}
              loading={contextLoading}
              canWrite={canWrite}
              completing={completing}
              phaseBusy={phaseBusy}
              onStartConsultation={handleStartConsultation}
              onOpenSurgery={
                selected?.surgery_id
                  ? () => navigate(`/hub/clinica/cirurgias/${selected.surgery_id}`)
                  : undefined
              }
              onOpenRecord={(section) => {
                const encId = selected?.encounter_id ?? patientContext?.encounter?.id;
                if (encId) openEncounter(encId, section);
              }}
              onAdmit={() => {
                setOpsPresetPetId(selected?.pet_id ?? patientContext?.pet?.id ?? null);
                setOpsPresetCaseId(patientContext?.encounter?.hub_case_id ?? null);
                setAdmitOpen(true);
                setHospSectionOpen(true);
                setCockpitTab('andamento');
              }}
              onComplete={() => void handleComplete()}
              onSetOperationalPhase={(phase) => void handleSetOperationalPhase(phase)}
            />
          </div>
        </VetCockpitOpsSection>
        ) : null}

        {cockpitTab === 'andamento' ? (
          <>
        <VetCockpitOpsSection
          id="internacoes"
          title="Internações ativas"
          open={hospSectionOpen}
          onToggle={() => setHospSectionOpen((v) => !v)}
        >
          <HubClinicHospitalPage
            embedded
            admitOpen={admitOpen}
            onAdmitOpenChange={setAdmitOpen}
            presetPetId={opsPresetPetId}
            presetCaseId={opsPresetCaseId}
          />
        </VetCockpitOpsSection>

        <VetCockpitOpsSection
          id="cirurgias"
          title="Cirurgias (agendadas / em andamento)"
          open={surgSectionOpen}
          onToggle={() => setSurgSectionOpen((v) => !v)}
        >
          <HubClinicSurgeriesPage
            embedded
            createOpen={surgeryCreateOpen}
            onCreateOpenChange={setSurgeryCreateOpen}
            presetPetId={opsPresetPetId}
            presetCaseId={opsPresetCaseId}
          />
        </VetCockpitOpsSection>
          </>
        ) : null}

        {cockpitTab === 'historico' ? (
          <section className="vet-cockpit-ops" aria-label="Histórico clínico">
            <div className="vet-cockpit-ops__body">
              <VetCockpitHistory clinicId={clinicId} staffId={staffId} />
            </div>
          </section>
        ) : null}
      </div>

      <CompleteEncounterCasePrompt
        open={Boolean(casePrompt)}
        prompt={casePrompt}
        saving={casePromptSaving}
        onChoose={(choice) => void handleCaseAfterComplete(choice)}
      />

      <StartEncounterModal
        open={Boolean(startModalItem)}
        clinicId={clinicId}
        item={startModalItem}
        onClose={() => setStartModalItem(null)}
        onStart={handleStartEncounter}
        starting={startingEncounter}
      />

      <ClinicWalkInPanel
        open={walkInOpen}
        clinicId={clinicId}
        defaultStaffId={staffId}
        onClose={() => setWalkInOpen(false)}
        onSubmit={createWalkIn}
        onScheduleAgenda={openAgendaForScheduling}
        submitting={creatingWalkIn}
      />
    </div>
  );
};

export default HubVetCockpitPage;
