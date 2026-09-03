import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BedDouble, FileSearch, Scissors, Stethoscope } from 'lucide-react';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubLoading } from '../../components/HubLoading';
import { HubTabs } from '../../components/HubTabs';
import {
  hubClinicalApi,
  hubClinicalCasesApi,
  hubClinicalTimelineApi,
  hubEncountersApi,
  type HubClinicalCase,
  type HubClinicalTimelineEvent,
  type HubEncounter,
  type HubPetClinicalFlag,
  type HubPrescription,
  type HubVaccination,
  type HubClinicalAttachment,
} from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet, type HubPetProfileChange } from '../../api/hubPetsApi';
import { formatPrescriptionLine } from './clinicalDisplay';
import { HubPrescriptionHistoryList } from '../../components/clinical/HubPrescriptionHistoryList';
import { petAgeDetailedLabel } from '../pets/petAge';
import { PetBehaviorTagsPicker } from '../pets/PetBehaviorTagsPicker';
import { PetBehaviorTagsDisplay } from '../pets/PetBehaviorTagsDisplay';
import { PetProfileHistoryList } from '../pets/PetProfileHistoryList';
import { PET_CLINICAL_FLAG_OPTIONS, defaultClinicalFlagLabel, neuteredLabel } from '../pets/petClinicalFlags';
import { behaviorTagLabel } from '../pets/petBehaviorTags';
import '../clientes/clientes.css';
import '../pets/pets-page.css';
import './clinica-page.css';

type TabId = 'casos' | 'timeline' | 'prescricoes' | 'vacinas' | 'exames' | 'flags';

const HubClinicRecordsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');
  const canWritePets = hasPermission('hub.pets.write') || canWrite;

  const initialPetId = searchParams.get('petId') || '';
  const initialTab = (searchParams.get('tab') as TabId) || 'casos';

  const [pets, setPets] = useState<HubPet[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialPetId);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [cases, setCases] = useState<HubClinicalCase[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<HubClinicalTimelineEvent[]>([]);
  const [flags, setFlags] = useState<HubPetClinicalFlag[]>([]);
  const [profileChanges, setProfileChanges] = useState<HubPetProfileChange[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [attachments, setAttachments] = useState<HubClinicalAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState('allergy');
  const [newFlagLabel, setNewFlagLabel] = useState('');
  const [startingEncounter, setStartingEncounter] = useState(false);
  const [savingFicha, setSavingFicha] = useState(false);

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
  }, [clinicId, canRead]);

  useEffect(() => {
    if (initialPetId) setSelectedId(initialPetId);
  }, [initialPetId]);

  const filteredPets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? pets.filter((p) => p.name.toLowerCase().includes(q)) : pets;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [pets, search]);

  const selectedPet = pets.find((p) => p.id === selectedId);

  const activeCasesCount = useMemo(
    () => cases.filter((c) => c.status === 'active' || c.status === 'monitoring').length,
    [cases],
  );

  const loadPetClinical = useCallback(async () => {
    if (!clinicId || !selectedId) return;
    setLoading(true);
    const results = await Promise.allSettled([
      hubEncountersApi.listByPet(clinicId, selectedId),
      hubClinicalCasesApi.list(clinicId, { petId: selectedId }),
      hubClinicalTimelineApi.list(clinicId, { petId: selectedId }),
      hubClinicalApi.listPetFlags(clinicId, selectedId),
      hubClinicalApi.listPrescriptions(clinicId, selectedId),
      hubClinicalApi.listVaccinations(clinicId, selectedId),
      hubClinicalApi.listAttachments(clinicId, { petId: selectedId }),
      hubPetsApi.listProfileChanges(clinicId, selectedId),
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

    const failed = results
      .map((r, i) => (r.status === 'rejected' ? i : -1))
      .filter((i) => i >= 0);
    const criticalFailed = failed.some((i) => i < 2);
    if (criticalFailed) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      showError((first?.reason as Error)?.message || 'Erro ao carregar prontuário');
    }
    setLoading(false);
  }, [clinicId, selectedId, showError]);

  useEffect(() => {
    void loadPetClinical();
  }, [loadPetClinical]);

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
    setStartingEncounter(true);
    try {
      const { encounter } = await hubEncountersApi.create({ clinic_id: clinicId, pet_id: selectedId });
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
      <div className="hub-clientes__main hub-clinic-records__list-pane">
        <header className="hub-clinic-records__list-intro">
          <p className="hub-clinic-records__list-kicker">Arquivo clínico</p>
          <p className="hub-clientes__muted hub-clinic-records__list-hint">
            Busque o pet para ver histórico, casos, receitas e alertas.
          </p>
        </header>
        <div className="hub-clientes__toolbar hub-clinic-records__list-toolbar">
          <div className="hub-clientes__search hub-clinic-records__search">
            <FileSearch size={16} aria-hidden />
            <input
              type="search"
              placeholder="Buscar pet pelo nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar pet"
            />
          </div>
        </div>
        <div className="hub-clientes__table-wrap hub-clinic-records__table-wrap">
          <table className="hub-clientes__table hub-clinic-records__table">
            <thead>
              <tr>
                <th>Pet</th>
                <th>Espécie</th>
                <th>Idade</th>
              </tr>
            </thead>
            <tbody>
              {filteredPets.length === 0 ? (
                <tr>
                  <td colSpan={3} className="hub-clientes__muted" style={{ textAlign: 'center', padding: 28 }}>
                    {search.trim() ? 'Nenhum pet encontrado com esse nome.' : 'Nenhum pet cadastrado.'}
                  </td>
                </tr>
              ) : (
                filteredPets.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'hub-clientes__row--selected' : undefined}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td>
                      <span className="hub-clinic-records__pet-cell">{p.name}</span>
                    </td>
                    <td>{p.species}</td>
                    <td>{petAgeDetailedLabel(p.birth_date ?? null)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="hub-clientes__panel hub-clinic-records__detail">
        <div className="hub-clientes__panel-scroll">
          {!selectedPet ? (
            <div className="hub-clinic-records__empty">
              <FileSearch size={28} aria-hidden />
              <p>Selecione um pet na lista para abrir o prontuário.</p>
              <p className="hub-clientes__muted">
                A operação do dia (fila, internar, cirurgia) fica em{' '}
                <Link to="/hub/clinica" className="hub-clientes__link">
                  Consultório
                </Link>
                .
              </p>
            </div>
          ) : loading ? (
            <HubLoading variant="block" label="Carregando prontuário…" />
          ) : (
            <>
              <header className="hub-clinic-records__header">
                <div className="hub-clinic-records__header-top">
                  <div>
                    <p className="hub-clinic-records__list-kicker">Prontuário</p>
                    <h2 className="hub-clinic-records__pet-name">{selectedPet.name}</h2>
                    <p className="hub-clinic-records__pet-meta">
                      {[
                        selectedPet.species,
                        selectedPet.breed,
                        petAgeDetailedLabel(selectedPet.birth_date ?? null),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>

                {flags.length > 0 || (selectedPet.behavior_tags?.length ?? 0) > 0 ? (
                  <div className="hub-clinic-pet-header__alerts">
                    {flags.map((f) => (
                      <span key={f.flag_key} className="hub-clinic-alert-chip">
                        {f.label}
                      </span>
                    ))}
                    {(selectedPet.behavior_tags ?? []).map((t) => (
                      <span key={`b-${t}`} className="hub-clinic-alert-chip">
                        {behaviorTagLabel(t)}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="hub-clinic-records__stats" aria-label="Resumo do prontuário">
                  <div className="hub-clinic-records__stat">
                    <span className="hub-clinic-records__stat-value">{activeCasesCount}</span>
                    <span className="hub-clinic-records__stat-label">Casos ativos</span>
                  </div>
                  <div className="hub-clinic-records__stat">
                    <span className="hub-clinic-records__stat-value">{encounters.length}</span>
                    <span className="hub-clinic-records__stat-label">Atendimentos</span>
                  </div>
                  <div className="hub-clinic-records__stat">
                    <span className="hub-clinic-records__stat-value">{prescriptions.length}</span>
                    <span className="hub-clinic-records__stat-label">Prescrições</span>
                  </div>
                  <div className="hub-clinic-records__stat">
                    <span className="hub-clinic-records__stat-value">{flags.length}</span>
                    <span className="hub-clinic-records__stat-label">Alertas</span>
                  </div>
                </div>

                {canWrite ? (
                  <div className="hub-clinic-records__actions" role="group" aria-label="Ações a partir do prontuário">
                    <button
                      type="button"
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                      disabled={startingEncounter}
                      onClick={() => void startEncounterFromRecord()}
                    >
                      <Stethoscope size={14} aria-hidden />
                      {startingEncounter ? 'Abrindo…' : 'Iniciar atendimento'}
                    </button>
                    <Link
                      to={`/hub/clinica?admit=1&pet_id=${encodeURIComponent(selectedId)}`}
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    >
                      <BedDouble size={14} aria-hidden />
                      Internar
                    </Link>
                    <Link
                      to={`/hub/clinica?surgery=1&pet_id=${encodeURIComponent(selectedId)}`}
                      className="hub-clientes__btn hub-clientes__btn--ghost hub-clientes__btn--sm"
                    >
                      <Scissors size={14} aria-hidden />
                      Cirurgia
                    </Link>
                  </div>
                ) : null}
              </header>

              <HubTabs
                className="hub-clinic-records__tabs"
                ariaLabel="Seções do prontuário"
                variant="page"
                activeId={tab}
                onTabChange={(id) => setTab(id as TabId)}
                items={[
                  { id: 'casos', label: 'Casos clínicos' },
                  { id: 'timeline', label: 'Linha do tempo' },
                  { id: 'prescricoes', label: 'Prescrições' },
                  { id: 'vacinas', label: 'Vacinas' },
                  { id: 'exames', label: 'Exames' },
                  { id: 'flags', label: 'Alertas' },
                ]}
              />

              {tab === 'casos' && (
                <div className="hub-clinic-cases">
                  {cases.length === 0 ? (
                    <p className="hub-clientes__muted">Nenhum caso clínico registrado.</p>
                  ) : (
                    cases.map((c) => (
                      <div key={c.id} className="hub-clinic-cases__item">
                        <div className="hub-clinic-cases__item-header">
                          <strong className="hub-clinic-cases__title">{c.title}</strong>
                          <span className={`hub-clinic-cases__badge hub-clinic-cases__badge--${c.status}`}>
                            {c.status === 'active' && 'Ativo'}
                            {c.status === 'monitoring' && 'Monitoramento'}
                            {c.status === 'resolved' && 'Resolvido'}
                            {c.status === 'cancelled' && 'Cancelado'}
                          </span>
                        </div>
                        {c.summary ? <p className="hub-clinic-cases__summary">{c.summary}</p> : null}
                        <div className="hub-clinic-cases__meta">
                          <small className="hub-clientes__muted">
                            Aberto em {new Date(c.opened_at).toLocaleDateString('pt-BR')}
                            {c.closed_at
                              ? ` · Fechado em ${new Date(c.closed_at).toLocaleDateString('pt-BR')}`
                              : ''}
                          </small>
                        </div>
                        <Link to={`/hub/clinica/casos/${c.id}`} className="hub-clientes__link">
                          Ver caso →
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div className="hub-clinic-timeline">
                  {timelineEvents.length === 0 && encounters.length === 0 ? (
                    <p className="hub-clientes__muted">Sem histórico clínico.</p>
                  ) : timelineEvents.length > 0 ? (
                    timelineEvents.map((ev) => (
                      <div key={ev.id} className="hub-clinic-timeline__item">
                        <strong>{ev.title}</strong>
                        {ev.body ? <p className="hub-clinic-timeline__body">{ev.body}</p> : null}
                        <small className="hub-clientes__muted">
                          {new Date(ev.event_at).toLocaleString('pt-BR')}
                          {ev.created_by_member ? ` · ${ev.created_by_member.full_name}` : ''}
                        </small>
                      </div>
                    ))
                  ) : (
                    encounters.map((e) => (
                      <div key={e.id} className="hub-clinic-timeline__item">
                        <strong>Atendimento — {e.status}</strong>
                        <p className="hub-clinic-timeline__body">{e.chief_complaint || e.summary_notes || '—'}</p>
                        <Link to={`/hub/clinica/atendimentos/${e.id}`} className="hub-clientes__link">
                          Abrir atendimento
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'prescricoes' && (
                <>
                  {prescriptions.length === 0 ? (
                    <p className="hub-clientes__muted">Nenhuma prescrição.</p>
                  ) : clinicId ? (
                    <HubPrescriptionHistoryList
                      prescriptions={prescriptions}
                      clinicId={clinicId}
                      canWrite={canWrite}
                    />
                  ) : (
                    <ul className="hub-clinic-records__list">
                      {prescriptions.map((p) => (
                        <li key={p.id}>{formatPrescriptionLine(p)}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {tab === 'vacinas' && (
                <ul className="hub-clinic-records__list">
                  {vaccinations.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhuma vacina registrada.</li>
                  ) : (
                    vaccinations.map((v) => (
                      <li key={v.id}>
                        {v.vaccine_name} — {v.administered_at}
                        {v.next_dose_at ? ` · Próxima: ${v.next_dose_at}` : ''}
                      </li>
                    ))
                  )}
                </ul>
              )}

              {tab === 'exames' && (
                <ul className="hub-clinic-records__list">
                  {attachments.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhum exame anexado.</li>
                  ) : (
                    attachments.map((a) => (
                      <li key={a.id}>
                        <a href={a.storage_path} target="_blank" rel="noreferrer">
                          {a.title || a.file_name}
                        </a>
                      </li>
                    ))
                  )}
                </ul>
              )}

              {tab === 'flags' && (
                <div className="hub-clinic-records__flags">
                  <div className="hub-clientes__form-stack" style={{ marginBottom: 16 }}>
                    <label className="hub-clientes__label">Castrado(a)</label>
                    <p className="hub-clientes__muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
                      Atual: {neuteredLabel(selectedPet.neutered)}
                    </p>
                    {canWritePets ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                          disabled={savingFicha || selectedPet.neutered === true}
                          onClick={() => void saveHealthFicha({ neutered: true })}
                        >
                          Sim
                        </button>
                        <button
                          type="button"
                          className="hub-clientes__btn hub-clientes__btn--outline hub-clientes__btn--sm"
                          disabled={savingFicha || selectedPet.neutered === false}
                          onClick={() => void saveHealthFicha({ neutered: false })}
                        >
                          Não
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Alertas clínicos</h4>
                  <ul className="hub-clinic-records__list">
                    {flags.length === 0 ? (
                      <li className="hub-clientes__muted">Nenhum alerta ativo.</li>
                    ) : (
                      flags.map((f) => (
                        <li key={f.flag_key} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>
                            {f.label} <span className="hub-clientes__muted">({f.flag_key})</span>
                          </span>
                          {canWrite ? (
                            <button
                              type="button"
                              className="hub-clientes__link-btn"
                              onClick={() => void removeFlag(f)}
                            >
                              Remover
                            </button>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                  {canWrite ? (
                    <div className="hub-clientes__form-stack" style={{ marginTop: 16 }}>
                      <label className="hub-clientes__label">Tipo de alerta</label>
                      <select
                        className="hub-clientes__input"
                        value={newFlagKey}
                        onChange={(e) => setNewFlagKey(e.target.value)}
                      >
                        {PET_CLINICAL_FLAG_OPTIONS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label className="hub-clientes__label">Descrição</label>
                      <input
                        className="hub-clientes__input"
                        value={newFlagLabel}
                        onChange={(e) => setNewFlagLabel(e.target.value)}
                        placeholder="Ex.: Alergia a dipirona"
                      />
                      <button
                        type="button"
                        className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                        onClick={() => void addFlag()}
                      >
                        Adicionar alerta
                      </button>
                    </div>
                  ) : null}

                  <h4 style={{ margin: '20px 0 8px', fontSize: 14 }}>Comportamento</h4>
                  {canWritePets ? (
                    <PetBehaviorTagsPicker
                      value={selectedPet.behavior_tags ?? []}
                      onChange={(behaviorTags) =>
                        void saveHealthFicha({ behavior_tags: behaviorTags.length ? behaviorTags : [] })
                      }
                      variant="hub-pets-behavior"
                      disabled={savingFicha}
                    />
                  ) : (
                    <PetBehaviorTagsDisplay tags={selectedPet.behavior_tags ?? []} />
                  )}

                  <h4 style={{ margin: '20px 0 8px', fontSize: 14 }}>Histórico da ficha</h4>
                  <PetProfileHistoryList changes={profileChanges} />
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export default HubClinicRecordsPage;
