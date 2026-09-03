import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth, usePermissions, type AppRole } from '@petimi/web-core';
import { useAlert } from '../../../components/AlertProvider';
import { HubLoading } from '../../../components/HubLoading';
import { HubDateField } from '../../../components/HubDateField';
import { formatYmd, parseIsoYmd } from '../../../utils/hubCalendar';
import {
  hubEncountersApi,
  hubVetCockpitApi,
  type DayBoardItem,
  type HubEncounterOperationalPhase,
  type VetCockpitPatientContext,
} from '../../../api/hubClinicalApi';
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
import VetCockpitQueue from './VetCockpitQueue';
import VetCockpitPatientPanel, { type VetCockpitDrawerSection } from './VetCockpitPatientPanel';
import {
  cockpitEncounterPath,
  computeTurnSummary,
  itemKey,
  readStoredSelection,
  writeStoredSelection,
} from './vetCockpitUtils';
import '../clinica-page.css';
import '../../clientes/clientes.css';
import '../../../components/HubViewDateToolbar.css';
import './vet-cockpit.css';

const POLL_MS = 30_000;

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
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DayBoardItem | null>(null);
  const [patientContext, setPatientContext] = useState<VetCockpitPatientContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [startModalItem, setStartModalItem] = useState<DayBoardItem | null>(null);
  const [startingEncounter, setStartingEncounter] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [creatingWalkIn, setCreatingWalkIn] = useState(false);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [surgeryCreateOpen, setSurgeryCreateOpen] = useState(false);
  const [hospSectionOpen, setHospSectionOpen] = useState(true);
  const [surgSectionOpen, setSurgSectionOpen] = useState(true);
  const [opsPresetPetId, setOpsPresetPetId] = useState<string | null>(null);
  const [opsPresetCaseId, setOpsPresetCaseId] = useState<string | null>(null);
  const [badgeHints, setBadgeHints] = useState<
    Record<string, { examsAvailable?: boolean; rxDraft?: boolean; hospitalized?: boolean }>
  >({});

  const dayRange = useMemo(() => dayRangeIsoLocal(cursor), [cursor]);
  const staffId = myStaffMember?.id;

  const loadQueue = useCallback(async () => {
    if (!clinicId || !staffId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await hubEncountersApi.dayBoard(clinicId, dayRange, { staffId });
      setItems(res.items ?? []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar fila');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, staffId, dayRange, showError]);

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
    }
    if (wantSurgery) {
      setSurgeryCreateOpen(true);
      setSurgSectionOpen(true);
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
        return;
      }
      setContextLoading(true);
      try {
        const ctx = await hubVetCockpitApi.patientContext(clinicId, {
          petId: item.pet_id,
          encounterId: item.encounter_id,
          appointmentId: item.appointment_id,
        });
        setPatientContext(ctx);
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
    if (selected.kind === 'appointment_slot') {
      setStartModalItem(selected);
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
      await hubEncountersApi.complete(encId, clinicId);
      showSuccess('Atendimento finalizado');
      await loadQueue();
      setPatientContext(null);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao finalizar atendimento');
    } finally {
      setCompleting(false);
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
        {myStaffMember ? (
          <span className="vet-cockpit-toolbar__vet">{myStaffMember.full_name}</span>
        ) : null}
      </div>

      {canWrite ? (
        <div className="vet-cockpit-day-actions" role="group" aria-label="Operação do dia">
          <span className="vet-cockpit-day-actions__label">Operação do dia</span>
          <button
            type="button"
            className="hub-clientes__btn hub-clientes__btn--primary"
            disabled={!linked}
            title={!linked ? 'Vincule seu usuário a um profissional na Equipe' : undefined}
            onClick={() => setWalkInOpen(true)}
          >
            Novo atendimento
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => {
            setOpsPresetPetId(null);
            setOpsPresetCaseId(null);
            setAdmitOpen(true);
            setHospSectionOpen(true);
          }}>
            Internar
          </button>
          <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => {
            setOpsPresetPetId(null);
            setOpsPresetCaseId(null);
            setSurgeryCreateOpen(true);
            setSurgSectionOpen(true);
          }}>
            Nova cirurgia
          </button>
        </div>
      ) : null}

      <VetCockpitHeader summary={summary} dateLabel={`Hoje: ${summary.total} atendimentos`} />
      <div className="vet-cockpit-layout">
        <VetCockpitQueue
          items={items}
          selectedKey={selected ? itemKey(selected) : null}
          onSelect={handleSelect}
          loading={loading || staffLoading}
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
          onOpenRecord={(section) => {
            const encId = selected?.encounter_id ?? patientContext?.encounter?.id;
            if (encId) openEncounter(encId, section);
          }}
          onAdmit={() => {
            setOpsPresetPetId(selected?.pet_id ?? patientContext?.pet?.id ?? null);
            setOpsPresetCaseId(patientContext?.encounter?.hub_case_id ?? null);
            setAdmitOpen(true);
            setHospSectionOpen(true);
          }}
          onComplete={() => void handleComplete()}
          onSetOperationalPhase={(phase) => void handleSetOperationalPhase(phase)}
        />
      </div>

      <div className="hub-clinic-sections vet-cockpit-ops-sections">
        <section className="hub-clinic-section">
          <button
            type="button"
            className="hub-clinic-section__header"
            aria-expanded={hospSectionOpen}
            onClick={() => setHospSectionOpen((v) => !v)}
          >
            <span className="hub-clinic-section__title">Internações ativas</span>
            <ChevronDown size={18} style={{ transform: hospSectionOpen ? 'rotate(180deg)' : undefined }} aria-hidden />
          </button>
          {hospSectionOpen ? (
            <div className="hub-clinic-section__body">
              <HubClinicHospitalPage
                embedded
                admitOpen={admitOpen}
                onAdmitOpenChange={setAdmitOpen}
                presetPetId={opsPresetPetId}
                presetCaseId={opsPresetCaseId}
              />
            </div>
          ) : null}
        </section>

        <section className="hub-clinic-section">
          <button
            type="button"
            className="hub-clinic-section__header"
            aria-expanded={surgSectionOpen}
            onClick={() => setSurgSectionOpen((v) => !v)}
          >
            <span className="hub-clinic-section__title">Cirurgias (agendadas / em andamento)</span>
            <ChevronDown size={18} style={{ transform: surgSectionOpen ? 'rotate(180deg)' : undefined }} aria-hidden />
          </button>
          {surgSectionOpen ? (
            <div className="hub-clinic-section__body">
              <HubClinicSurgeriesPage
                embedded
                createOpen={surgeryCreateOpen}
                onCreateOpenChange={setSurgeryCreateOpen}
                presetPetId={opsPresetPetId}
                presetCaseId={opsPresetCaseId}
              />
            </div>
          ) : null}
        </section>
      </div>

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
