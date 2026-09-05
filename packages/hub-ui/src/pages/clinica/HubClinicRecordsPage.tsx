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
  type HubPetClinicalFlag,
  type HubPrescription,
  type HubSpecialistReferral,
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
  'exames',
  'flags',
]);

function parseTab(value: string | null): ClinicRecordsTabId {
  return value && TAB_IDS.has(value as ClinicRecordsTabId) ? (value as ClinicRecordsTabId) : 'casos';
}

const HubClinicRecordsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
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
    setPetsLoading(true);
    void hubPetsApi
      .list(clinicId)
      .then((r) => setPets(r.pets ?? []))
      .catch(() => setPets([]))
      .finally(() => setPetsLoading(false));
  }, [clinicId, canRead]);

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

  const selectedPet = pets.find((p) => p.id === selectedId);

  const loadPetClinical = useCallback(async () => {
    if (!clinicId || !selectedId) return;
    const keepContent = loadedPetIdRef.current === selectedId;
    if (keepContent) setRefreshing(true);
    else setLoading(true);
    const results = await Promise.allSettled([
      hubEncountersApi.listByPet(clinicId, selectedId),
      hubClinicalCasesApi.list(clinicId, { petId: selectedId }),
      hubClinicalTimelineApi.list(clinicId, { petId: selectedId }),
      hubClinicalApi.listPetFlags(clinicId, selectedId),
      hubClinicalApi.listPrescriptions(clinicId, selectedId),
      hubClinicalApi.listVaccinations(clinicId, selectedId),
      hubClinicalApi.listAttachments(clinicId, { petId: selectedId }),
      hubPetsApi.listProfileChanges(clinicId, selectedId),
      hubClinicalExamsApi.list(clinicId, { petId: selectedId }),
      hubSpecialistReferralsApi.list(clinicId, { petId: selectedId }),
    ]);
    const pick = <T,>(i: number, fallback: T): T => {
      const r = results[i];
      return r?.status === 'fulfilled' ? (r.value as T) : fallback;
    };
    setEncounters(pick(0, { encounters: [] }).encounters ?? []);
    setCases(pick(1, { cases: [] }).cases ?? []);
    setTimelineEvents(pick(2, { events: [] }).events ?? []);
    setFlags(pick(3, { flags: [] }).flags ?? []);
    setPrescriptions(pick(4, { prescriptions: [] }).prescriptions ?? []);
    setVaccinations(pick(5, { vaccinations: [] }).vaccinations ?? []);
    setAttachments(pick(6, { attachments: [] }).attachments ?? []);
    setProfileChanges(pick(7, { changes: [] }).changes ?? []);
    setExams(pick(8, { exams: [] }).exams ?? []);
    setReferrals(pick(9, { referrals: [] }).referrals ?? []);

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? i : -1))
      .filter((i) => i >= 0);
    const criticalFailed = failed.some((i) => i < 2);
    if (criticalFailed) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      showError((first?.reason as Error)?.message || 'Erro ao carregar prontuário');
    } else {
      loadedPetIdRef.current = selectedId;
    }
    setLoading(false);
    setRefreshing(false);
  }, [clinicId, selectedId, showError]);

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
        pets={filteredPets}
        selectedId={selectedId}
        search={search}
        onSearchChange={setSearch}
        onSelect={handleSelect}
        loading={petsLoading}
      />
      <ClinicRecordsDetail
        pet={selectedPet}
        loading={Boolean(selectedId) && (loading || (petsLoading && !selectedPet))}
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
      />
    </div>
  );
};

export default HubClinicRecordsPage;
