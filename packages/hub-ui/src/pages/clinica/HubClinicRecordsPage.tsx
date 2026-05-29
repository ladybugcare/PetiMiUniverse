import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getStoredClinicId, usePermissions } from '@petimi/web-core';
import { useAlert } from '../../components/AlertProvider';
import { HubTabs } from '../../components/HubTabs';
import {
  hubClinicalApi,
  hubEncountersApi,
  type HubEncounter,
  type HubEncounterEvent,
  type HubPetClinicalFlag,
  type HubPrescription,
  type HubVaccination,
  type HubClinicalAttachment,
} from '../../api/hubClinicalApi';
import { hubPetsApi, type HubPet } from '../../api/hubPetsApi';
import { formatEventAt, formatEventBody, formatEventTitle, formatPrescriptionLine } from './clinicalDisplay';
import { petAgeDetailedLabel } from '../pets/petAge';

type TabId = 'timeline' | 'prescricoes' | 'vacinas' | 'exames' | 'flags';

const FLAG_OPTIONS: { key: string; label: string }[] = [
  { key: 'allergy', label: 'Alergia' },
  { key: 'cardiac', label: 'Cardiopata' },
  { key: 'aggressive', label: 'Agressivo' },
  { key: 'diabetic', label: 'Diabético' },
  { key: 'epileptic', label: 'Epiléptico' },
  { key: 'other', label: 'Outro' },
];

const HubClinicRecordsPage: React.FC = () => {
  const clinicId = getStoredClinicId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('hub.clinic.read');
  const canWrite = hasPermission('hub.clinic.write');

  const initialPetId = searchParams.get('petId') || '';
  const initialTab = (searchParams.get('tab') as TabId) || 'timeline';

  const [pets, setPets] = useState<HubPet[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialPetId);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [encounters, setEncounters] = useState<HubEncounter[]>([]);
  const [events, setEvents] = useState<HubEncounterEvent[]>([]);
  const [flags, setFlags] = useState<HubPetClinicalFlag[]>([]);
  const [prescriptions, setPrescriptions] = useState<HubPrescription[]>([]);
  const [vaccinations, setVaccinations] = useState<HubVaccination[]>([]);
  const [attachments, setAttachments] = useState<HubClinicalAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState('allergy');
  const [newFlagLabel, setNewFlagLabel] = useState('');

  useEffect(() => {
    if (!clinicId || !canRead) return;
    void hubPetsApi.list(clinicId).then((r) => setPets(r.pets ?? [])).catch(() => setPets([]));
  }, [clinicId, canRead]);

  useEffect(() => {
    if (initialPetId) setSelectedId(initialPetId);
  }, [initialPetId]);

  const filteredPets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pets;
    return pets.filter((p) => p.name.toLowerCase().includes(q));
  }, [pets, search]);

  const selectedPet = pets.find((p) => p.id === selectedId);

  const loadPetClinical = useCallback(async () => {
    if (!clinicId || !selectedId) return;
    setLoading(true);
    const results = await Promise.allSettled([
      hubEncountersApi.listByPet(clinicId, selectedId),
      hubClinicalApi.listEvents(clinicId, selectedId),
      hubClinicalApi.listPetFlags(clinicId, selectedId),
      hubClinicalApi.listPrescriptions(clinicId, selectedId),
      hubClinicalApi.listVaccinations(clinicId, selectedId),
      hubClinicalApi.listAttachments(clinicId, { petId: selectedId }),
    ]);
    const pick = <T,>(i: number, fallback: T): T => {
      const r = results[i];
      return r?.status === 'fulfilled' ? (r.value as T) : fallback;
    };
    setEncounters(pick(0, { encounters: [] }).encounters ?? []);
    setEvents(pick(1, { events: [] }).events ?? []);
    setFlags(pick(2, { flags: [] }).flags ?? []);
    setPrescriptions(pick(3, { prescriptions: [] }).prescriptions ?? []);
    setVaccinations(pick(4, { vaccinations: [] }).vaccinations ?? []);
    setAttachments(pick(5, { attachments: [] }).attachments ?? []);

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
      });
      setNewFlagLabel('');
      await loadPetClinical();
      showSuccess('Alerta clínico salvo');
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao salvar alerta');
    }
  };

  if (!canRead) {
    return <p className="hub-clientes__muted hub-clinic-page__pad">Sem permissão para prontuários.</p>;
  }

  return (
    <div className="hub-clientes hub-clinic-records">
      <div className="hub-clientes__main">
        <div className="hub-clientes__toolbar">
          <div className="hub-clientes__search">
            <input
              type="search"
              placeholder="Buscar pet…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="hub-clientes__table-wrap">
          <table className="hub-clientes__table">
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
                    Nenhum pet encontrado.
                  </td>
                </tr>
              ) : (
                filteredPets.map((p) => (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'hub-clientes__row--selected' : undefined}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td>{p.name}</td>
                    <td>{p.species}</td>
                    <td>{petAgeDetailedLabel(p.birth_date ?? null)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {!selectedPet ? (
            <div className="hub-clientes__empty-state">Selecione um pet para ver o prontuário.</div>
          ) : loading ? (
            <p className="hub-clientes__muted">Carregando prontuário…</p>
          ) : (
            <>
              <header className="hub-clinic-records__header">
                <h2 className="hub-clinic-records__pet-name">{selectedPet.name}</h2>
                <p className="hub-clientes__muted">
                  {selectedPet.species}
                  {selectedPet.breed ? ` · ${selectedPet.breed}` : ''}
                </p>
                {flags.length > 0 ? (
                  <div className="hub-clinic-pet-header__alerts">
                    {flags.map((f) => (
                      <span key={f.flag_key} className="hub-clinic-alert-chip">
                        {f.label}
                      </span>
                    ))}
                  </div>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    className="hub-clientes__btn hub-clientes__btn--primary hub-clientes__btn--sm"
                    onClick={() => {
                      if (!clinicId) return;
                      void hubEncountersApi
                        .create({ clinic_id: clinicId, pet_id: selectedId })
                        .then(({ encounter }) => navigate(`/hub/clinica/atendimentos/${encounter.id}`))
                        .catch((e: unknown) =>
                          showError((e as Error)?.message || 'Erro ao iniciar atendimento'),
                        );
                    }}
                  >
                    Novo atendimento
                  </button>
                ) : null}
              </header>

              <HubTabs
                className="hub-clinic-records__tabs"
                ariaLabel="Prontuário do pet"
                variant="page"
                activeId={tab}
                onTabChange={(id) => setTab(id as TabId)}
                items={[
                  { id: 'timeline', label: 'Linha do tempo' },
                  { id: 'prescricoes', label: 'Prescrições' },
                  { id: 'vacinas', label: 'Vacinas' },
                  { id: 'exames', label: 'Exames' },
                  { id: 'flags', label: 'Alertas' },
                ]}
              />

              {tab === 'timeline' && (
                <div className="hub-clinic-timeline">
                  {events.length === 0 && encounters.length === 0 ? (
                    <p className="hub-clientes__muted">Sem histórico clínico.</p>
                  ) : (
                    <>
                      {events.map((ev) => (
                        <div key={ev.id} className="hub-clinic-timeline__item">
                          <strong>{formatEventTitle(ev)}</strong>
                          {formatEventBody(ev) ? (
                            <p className="hub-clinic-timeline__body">{formatEventBody(ev)}</p>
                          ) : null}
                          <small className="hub-clientes__muted">{formatEventAt(ev)}</small>
                        </div>
                      ))}
                      {encounters.map((e) => (
                        <div key={e.id} className="hub-clinic-timeline__item">
                          <strong>Atendimento — {e.status}</strong>
                          <p className="hub-clinic-timeline__body">{e.chief_complaint || e.summary_notes || '—'}</p>
                          <Link to={`/hub/clinica/atendimentos/${e.id}`} className="hub-clientes__link">
                            Abrir atendimento
                          </Link>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {tab === 'prescricoes' && (
                <ul className="hub-clinic-records__list">
                  {prescriptions.length === 0 ? (
                    <li className="hub-clientes__muted">Nenhuma prescrição.</li>
                  ) : (
                    prescriptions.map((p) => (
                      <li key={p.id}>{formatPrescriptionLine(p)}</li>
                    ))
                  )}
                </ul>
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
                  <ul className="hub-clinic-records__list">
                    {flags.map((f) => (
                      <li key={f.flag_key}>
                        {f.label} <span className="hub-clientes__muted">({f.flag_key})</span>
                      </li>
                    ))}
                  </ul>
                  {canWrite ? (
                    <div className="hub-clientes__form-stack" style={{ marginTop: 16 }}>
                      <label className="hub-clientes__label">Tipo de alerta</label>
                      <select
                        className="hub-clientes__input"
                        value={newFlagKey}
                        onChange={(e) => setNewFlagKey(e.target.value)}
                      >
                        {FLAG_OPTIONS.map((o) => (
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
