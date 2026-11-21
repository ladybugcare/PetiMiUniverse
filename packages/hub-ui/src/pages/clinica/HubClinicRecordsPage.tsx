import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { getSelectedUnitId } from '../../utils/useSelectedUnitId';
import { useAlert } from '../../components/AlertProvider';
import {
  hubClinicalApi,
  hubClinicalCasesApi,
  hubClinicalExamsApi,
  hubClinicalTimelineApi,
  hubEncountersApi,
  hubSpecialistReferralsApi,
  type HubClinicalAttachment,
  type HubClinicalCase,
  type HubClinicalExam,
  type HubClinicalTimelineEvent,
  type HubEncounter,
  type HubHospitalization,
  type HubPetClinicalFlag,
  type HubPrescription,
  type HubSpecialistReferral,
  type HubSurgery,
  type HubVaccination,
} from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet, type HubPetProfileChange } from '../../api/hubPetsApi';
import ClinicRecordsDetail from './clinic-records/ClinicRecordsDetail';
import ClinicRecordsPetList from './clinic-records/ClinicRecordsPetList';
import type { ClinicRecordsTabId } from './clinic-records/clinicRecordsUtils';
import { defaultClinicalFlagLabel } from '../pets/petClinicalFlags';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import './clinica-page.css';
import './clinic-records/clinic-records.css';

const TAB_IDS = new Set<ClinicRecordsTabId>([
  'casos',
  'timeline',
  'prescricoes',
  'vacinas',
  'cirurgias',
  'internacoes',
  'exames',
  'flags',
]);

function parseTab(value: string | null): ClinicRecordsTabId {
  return value && TAB_IDS.has(value as ClinicRecordsTabId) ? (value as ClinicRecordsTabId) : 'casos';
}

/** Pet mínimo a partir do atendimento — CVET tem clinic.read, mas nem sempre pets.read. */
function petFromEncounterContext(
  petId: string,
  clinicId: string,
  encounters: HubEncounter[],
): HubPet | undefined {
  const encounter = encounters.find((e) => e.pet_id === petId && e.pet);
  if (!encounter?.pet) return undefined;
  const p = encounter.pet;
  return {
    id: petId,
    petmi_pet_id: '',
    clinic_id: clinicId,
    name: p.name,
    species: p.species || '',
    breed: p.breed ?? null,
    sex: null,
    birth_date: p.birth_date ?? null,
    notes: null,
    behavior_tags: p.behavior_tags ?? null,
    neutered: p.neutered ?? null,
    size_tier: (p.size_tier as HubPet['size_tier']) || 'medio',
    coat_color: null,
    coat_type: (p.coat_type as HubPet['coat_type']) ?? null,
    created_at: encounter.created_at || '',
    updated_at: encounter.updated_at || '',
    primary_guardian: encounter.guardian
      ? { guardian_id: encounter.guardian.id, guardian_name: encounter.guardian.full_name }
      : null,
    secondary_guardian: null,
  };
}

const HubClinicRecordsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canReadPets = hasPermission('hub.pets.read');
  const canWrite = hasPermission('hub.clinic.write');
  const canWritePets = hasPermission('hub.pets.write') || canWrite;

  const initialPetId = searchParams.get('petId') || '';
  const initialTab = parseTab(searchParams.get('tab'));

  const [pets, setPets] = useState<HubPet[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialPetId);
  const [tab, setTab] = useState<ClinicRecordsTabId>(initialTab);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [cases, setCases] = useState<HubClinicalCase[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<HubClinicalTimelineEvent[]>([]);
  const [flags, setFlags] = useState<HubPetClinicalFlag[]>([]);
  const [profileChanges, setProfileChanges] = useState<HubPetProfileChange[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [attachments, setAttachments] = useState<HubClinicalAttachment[]>([]);
  const [exams, setExams] = useState<HubClinicalExam[]>([]);
  const [referrals, setReferrals] = useState<HubSpecialistReferral[]>([]);
  const [surgeries, setSurgeries] = useState<HubSurgery[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HubHospitalization[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadedPetIdRef = useRef<string | null>(null);
  const [newFlagKey, setNewFlagKey] = useState('allergy');
  const [newFlagLabel, setNewFlagLabel] = useState('');
  const [startingEncounter, setStartingEncounter] = useState(false);
  const [savingFicha, setSavingFicha] = useState(false);

  const syncUrl = useCallback(
    (petId: string, nextTab: ClinicRecordsTabId) => {
      const next = new URLSearchParams(searchParams);
      if (petId) next.set('petId', petId);
      else next.delete('petId');
      if (nextTab && nextTab !== 'casos') next.set('tab', nextTab);
      else next.delete('tab');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!clinicId || !canRead) return;
    // CVET tem clinic.read, mas não pets.read — evita 403/timeout inútil na lista.
    if (!canReadPets) {
      setPets([]);
      setPetsLoading(false);
      return;
    }
    setPetsLoading(true);
    void hubPetsApi
      .list(clinicId)
      .then((r) => setPets(r.pets ?? []))
      .catch(() => setPets([]))
      .finally(() => setPetsLoading(false));
  }, [clinicId, canRead, canReadPets]);

  useEffect(() => {
    if (initialPetId) setSelectedId(initialPetId);
  }, [initialPetId]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filteredPets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? pets.filter((p) => p.name.toLowerCase().includes(q)) : pets;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [pets, search]);

  const selectedPetFromList = pets.find((p) => p.id === selectedId);
  const selectedPet =
    selectedPetFromList ||
    (clinicId && selectedId ? petFromEncounterContext(selectedId, clinicId, encounters) : undefined);

  const petsForList = useMemo(() => {
    if (!selectedPet || pets.some((p) => p.id === selectedPet.id)) return filteredPets;
    return [selectedPet, ...filteredPets];
  }, [filteredPets, pets, selectedPet]);

  const loadPetClinical = useCallback(async () => {
    if (!clinicId || !selectedId) return;
    const keepContent = loadedPetIdRef.current === selectedId;
    if (keepContent) setRefreshing(true);
    else setLoading(true);

    const pickSettled = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === 'fulfilled' ? r.value : fallback;

    // Fase 1: exames + anexos (caminho do laudo). Evita listByPet no caminho crítico —
    // a listagem enriquecida de atendimentos pode estourar o timeout do cliente.
    const core = await Promise.allSettled([
      hubClinicalExamsApi.list(clinicId, { petId: selectedId }),
      hubClinicalApi.listAttachments(clinicId, { petId: selectedId }),
      hubClinicalCasesApi.list(clinicId, { petId: selectedId }),
    ]);
    const examsCore = pickSettled(core[0], { exams: [] }).exams ?? [];
    setExams(examsCore);
    setAttachments(pickSettled(core[1], { attachments: [] }).attachments ?? []);
    setCases(pickSettled(core[2], { cases: [] }).cases ?? []);

    const examEncounterId = examsCore.find((e) => e.hub_encounter_id)?.hub_encounter_id ?? null;
    if (examEncounterId) {
      try {
        const { encounter } = await hubEncountersApi.get(examEncounterId, clinicId);
        setEncounters([encounter]);
      } catch {
        // cabeçalho do pet fica para a fase 2
      }
    }

    if (core[0]?.status === 'rejected') {
      const first = core.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      showError((first?.reason as Error)?.message || 'Erro ao carregar prontuário');
    } else {
      loadedPetIdRef.current = selectedId;
    }
    setLoading(false);

    // Fase 2: histórico completo em background (não bloqueia Exames).
    const rest = await Promise.allSettled([
      hubEncountersApi.listByPet(clinicId, selectedId),
      hubClinicalTimelineApi.list(clinicId, { petId: selectedId }),
      hubClinicalApi.listPetFlags(clinicId, selectedId),
      hubClinicalApi.listPrescriptions(clinicId, selectedId),
      hubClinicalApi.listVaccinations(clinicId, selectedId),
      canReadPets
        ? hubPetsApi.listProfileChanges(clinicId, selectedId)
        : Promise.resolve({ changes: [] as HubPetProfileChange[] }),
      hubSpecialistReferralsApi.list(clinicId, { petId: selectedId }),
      hubClinicalApi.listSurgeries(clinicId, undefined, undefined, selectedId),
      hubClinicalApi.listHospitalizations(clinicId, undefined, undefined, selectedId),
    ]);
    const encList = pickSettled(rest[0], { encounters: [] }).encounters ?? [];
    if (encList.length) setEncounters(encList);
    setTimelineEvents(pickSettled(rest[1], { events: [] }).events ?? []);
    setFlags(pickSettled(rest[2], { flags: [] }).flags ?? []);
    setPrescriptions(pickSettled(rest[3], { prescriptions: [] }).prescriptions ?? []);
    setVaccinations(pickSettled(rest[4], { vaccinations: [] }).vaccinations ?? []);
    setProfileChanges(pickSettled(rest[5], { changes: [] }).changes ?? []);
    setReferrals(pickSettled(rest[6], { referrals: [] }).referrals ?? []);
    setSurgeries(pickSettled(rest[7], { surgeries: [] }).surgeries ?? []);
    setHospitalizations(pickSettled(rest[8], { hospitalizations: [] }).hospitalizations ?? []);
    setRefreshing(false);
  }, [clinicId, selectedId, showError, canReadPets]);

  useEffect(() => {
    void loadPetClinical();
  }, [loadPetClinical]);

  useEffect(() => {
    if (!selectedId) return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 960px)').matches) return;
    document
      .querySelector('.hub-clinic-records__detail')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  const handleSelect = (petId: string) => {
    setSelectedId(petId);
    syncUrl(petId, tab);
  };

  const handleTabChange = (nextTab: ClinicRecordsTabId) => {
    setTab(nextTab);
    syncUrl(selectedId, nextTab);
  };

  const addFlag = async () => {
    if (!clinicId || !selectedId || !newFlagLabel.trim() || !canWrite) return;
    try {
      await hubClinicalApi.upsertPetFlag({
        clinic_id: clinicId,
        pet_id: selectedId,
        flag_key: newFlagKey,
        label: newFlagLabel.trim(),
        profile_source: 'clinic',
      });
      setNewFlagLabel('');
      await loadPetClinical();
      showSuccess('Alerta clínico salvo');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar alerta');
    }
  };

  const removeFlag = async (flag: HubPetClinicalFlag) => {
    if (!clinicId || !selectedId || !canWrite) return;
    try {
      await hubClinicalApi.upsertPetFlag({
        clinic_id: clinicId,
        pet_id: selectedId,
        flag_key: flag.flag_key,
        label: flag.label || defaultClinicalFlagLabel(flag.flag_key),
        notes: flag.notes ?? null,
        active: false,
        profile_source: 'clinic',
      });
      await loadPetClinical();
      showSuccess('Alerta removido da ficha');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao remover alerta');
    }
  };

  const saveHealthFicha = async (patch: {
    neutered?: boolean | null;
    behavior_tags?: string[] | null;
  }) => {
    if (!clinicId || !selectedId || !canWritePets) return;
    setSavingFicha(true);
    try {
      const { pet } = await hubPetsApi.update(selectedId, {
        clinic_id: clinicId,
        ...patch,
        behavior_tags_mode: 'replace',
        profile_source: 'clinic',
      });
      setPets((prev) => prev.map((p) => (p.id === pet.id ? { ...p, ...pet } : p)));
      await loadPetClinical();
      showSuccess('Ficha atualizada');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao atualizar ficha');
    } finally {
      setSavingFicha(false);
    }
  };

  const startEncounterFromRecord = async () => {
    if (!clinicId || !selectedId || !canWrite) return;
    const unitId = getSelectedUnitId();
    if (!unitId) {
      showError('Selecione uma unidade no cabeçalho para abrir o atendimento.');
      return;
    }
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.create({
        clinic_id: clinicId,
        pet_id: selectedId,
        unit_id: unitId,
      });
      navigate(`/hub/clinica/atendimentos/${encounter.id}`, { state: { from: 'cockpit' } });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao iniciar atendimento');
    } finally {
      setStartingEncounter(false);
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para prontuários.</p>;
  }

  return (
    <div className="hub-clientes hub-clinic-records">
      <ClinicRecordsPetList
        pets={petsForList}
        selectedId={selectedId}
        search={search}
        onSearchChange={setSearch}
        onSelect={handleSelect}
        loading={petsLoading && !selectedPet}
      />
      <ClinicRecordsDetail
        pet={selectedPet}
        loading={Boolean(selectedId) && (loading || (!selectedPet && (petsLoading || loading)))}
        refreshing={refreshing}
        tab={tab}
        onTabChange={handleTabChange}
        canWrite={canWrite}
        canWritePets={canWritePets}
        clinicId={clinicId}
        cases={cases}
        encounters={encounters}
        timelineEvents={timelineEvents}
        flags={flags}
        prescriptions={prescriptions}
        vaccinations={vaccinations}
        attachments={attachments}
        exams={exams}
        referrals={referrals}
        surgeries={surgeries}
        hospitalizations={hospitalizations}
        profileChanges={profileChanges}
        newFlagKey={newFlagKey}
        newFlagLabel={newFlagLabel}
        onNewFlagKeyChange={setNewFlagKey}
        onNewFlagLabelChange={setNewFlagLabel}
        startingEncounter={startingEncounter}
        savingFicha={savingFicha}
        onStartEncounter={() => void startEncounterFromRecord()}
        onAddFlag={() => void addFlag()}
        onRemoveFlag={(flag) => void removeFlag(flag)}
        onSaveHealthFicha={(patch) => void saveHealthFicha(patch)}
        onExamResultSaved={() => void loadPetClinical()}
      />
    </div>
  );
};

export default HubClinicRecordsPage;
