import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { hubGuardiansApi, type HubGuardian } from '../api/hubGuardiansApi';
import { hubPetsApi, type HubPet } from '../api/hubPetsApi';
import { useAlert } from '../components/AlertProvider';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import './clientes/clientes.css';
import './pets/pets-page.css';
import { PetsMetricsRow } from './pets/PetsMetricsRow';
import { PetsToolbar } from './pets/PetsToolbar';
import { PetsTable } from './pets/PetsTable';
import { PetsPagination } from './pets/PetsPagination';
import { PetForm } from './pets/PetForm';
import { PetDetailPanel } from './pets/PetDetailPanel';
import { emptyPetForm, type PetFormValues } from './pets/PetFormValues';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

type PanelMode = 'create' | 'detail' | 'edit';

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function petToForm(p: HubPet): PetFormValues {
  return {
    name: p.name,
    species: p.species,
    breed: p.breed || '',
    sex: (p.sex as PetFormValues['sex']) || '',
    birth_date: p.birth_date || '',
    notes: p.notes || '',
    primary_guardian_id: p.primary_guardian?.guardian_id || '',
    secondary_guardian_id: p.secondary_guardian?.guardian_id || '',
  };
}

const HubPetsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const [searchParams] = useSearchParams();

  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.pets.write');

  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pets, setPets] = useState<HubPet[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const debouncedQ = useDebounced(searchQ, 350);
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [tutorFilter, setTutorFilter] = useState('');
  const [situationFilter, setSituationFilter] = useState<'all' | 'ativo'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PetFormValues>(emptyPetForm);
  const [submitting, setSubmitting] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const loadGuardians = useCallback(async () => {
    if (!clinicId) return;
    const res = await hubGuardiansApi.list(clinicId, true);
    setGuardians(res.guardians || []);
  }, [clinicId]);

  const loadPets = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    try {
      const res = await hubPetsApi.list(clinicId, true);
      setPets(res.pets || []);
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar pets');
    } finally {
      setLoading(false);
    }
  }, [clinicId, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadGuardians();
  }, [clinicId, accessAllowed, loadGuardians]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void loadPets();
  }, [clinicId, accessAllowed, loadPets]);

  /** Links antigos `/hub/pets?guardianId=` abrem o wizard completo. */
  useEffect(() => {
    const g = searchParams.get('guardianId');
    if (!g || !accessAllowed) return;
    navigate(`/hub/pets/novo?guardianId=${encodeURIComponent(g)}`, { replace: true });
  }, [searchParams, accessAllowed, navigate]);

  const goToNewPetWizard = useCallback(() => {
    navigate('/hub/pets/novo');
  }, [navigate]);

  const selectedPet = useMemo(
    () => (selectedId ? pets.find((p) => p.id === selectedId) ?? null : null),
    [pets, selectedId]
  );

  const filteredRows = useMemo(() => {
    let list = pets;
    const q = debouncedQ.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = p.name.toLowerCase();
        const species = p.species.toLowerCase();
        const tutor = (p.primary_guardian?.guardian_name || '').toLowerCase();
        const tutor2 = (p.secondary_guardian?.guardian_name || '').toLowerCase();
        const chip = (p.petmi_pet_id || '').toLowerCase().replace(/\s/g, '');
        const qn = q.replace(/\s/g, '');
        return (
          name.includes(q) ||
          species.includes(q) ||
          tutor.includes(q) ||
          tutor2.includes(q) ||
          chip.includes(qn)
        );
      });
    }
    if (speciesFilter) {
      const sf = speciesFilter.trim().toLowerCase();
      list = list.filter((p) => p.species.trim().toLowerCase() === sf);
    }
    if (tutorFilter) {
      list = list.filter(
        (p) =>
          p.primary_guardian?.guardian_id === tutorFilter ||
          p.secondary_guardian?.guardian_id === tutorFilter
      );
    }
    if (situationFilter === 'ativo') {
      list = list.filter((p) => !p.deleted_at);
    }
    return list;
  }, [pets, debouncedQ, speciesFilter, tutorFilter, situationFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, speciesFilter, tutorFilter, situationFilter]);

  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyPetForm);
  }, []);

  const openCreate = useCallback(() => {
    setSelectedId(null);
    setPanelMode('create');
    resetForm();
  }, [resetForm]);

  const selectPet = useCallback((p: HubPet) => {
    setSelectedId(p.id);
    setPanelMode('detail');
    setEditingId(null);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setPanelMode('create');
    resetForm();
  }, [resetForm]);

  const startEditFromDetail = useCallback(() => {
    if (!selectedPet) return;
    setPanelMode('edit');
    setEditingId(selectedPet.id);
    setForm(petToForm(selectedPet));
  }, [selectedPet]);

  const startEditFromTable = useCallback((p: HubPet) => {
    setSelectedId(p.id);
    setPanelMode('edit');
    setEditingId(p.id);
    setForm(petToForm(p));
  }, []);

  const cancelEdit = useCallback(() => {
    if (selectedPet) {
      setPanelMode('detail');
      setEditingId(null);
    } else {
      openCreate();
    }
  }, [selectedPet, openCreate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !canWrite) return;
    if (!form.name.trim() || !form.species.trim()) {
      showError('Nome e espécie são obrigatórios');
      return;
    }
    if (!form.primary_guardian_id) {
      showError('Tutor principal é obrigatório');
      return;
    }
    setSubmitting(true);
    try {
      const sexVal = form.sex === '' ? null : form.sex;
      const sec =
        form.secondary_guardian_id && form.secondary_guardian_id !== form.primary_guardian_id
          ? form.secondary_guardian_id
          : null;

      if (editingId) {
        await hubPetsApi.update(editingId, {
          clinic_id: clinicId,
          name: form.name.trim(),
          species: form.species.trim(),
          breed: form.breed.trim() || null,
          sex: sexVal,
          birth_date: form.birth_date.trim() || null,
          notes: form.notes.trim() || null,
          primary_guardian_id: form.primary_guardian_id,
          secondary_guardian_id: sec,
        });
        showSuccess('Pet atualizado');
        setPanelMode('detail');
        setEditingId(null);
        await loadPets();
      } else {
        const { pet } = await hubPetsApi.create({
          clinic_id: clinicId,
          name: form.name.trim(),
          species: form.species.trim(),
          breed: form.breed.trim() || null,
          sex: sexVal,
          birth_date: form.birth_date.trim() || undefined,
          notes: form.notes.trim() || null,
          primary_guardian_id: form.primary_guardian_id,
          secondary_guardian_id: sec,
        });
        showSuccess('Pet criado');
        setSelectedId(pet.id);
        setPanelMode('detail');
        setEditingId(null);
        setForm(emptyPetForm);
        await loadPets();
      }
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = (p: HubPet) => {
    if (!clinicId || !canWrite) return;
    showConfirm(`Arquivar o pet "${p.name}"?`, () => {
      void (async () => {
        try {
          await hubPetsApi.update(p.id, { clinic_id: clinicId, archived: true });
          showSuccess('Pet arquivado');
          if (selectedId === p.id) closePanel();
          if (editingId === p.id) resetForm();
          await loadPets();
        } catch (err: unknown) {
          showError((err as Error)?.message || 'Erro ao arquivar');
        }
      })();
    }, 'Arquivar');
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">
          Selecione ou aceda a uma clínica para gerir pets (PetMi Hub). Inicie sessão no PetMi Vet e escolha uma
          clínica, depois volte ao Hub.
        </p>
      </div>
    );
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  return (
    <div className="hub-clientes hub-pets-page">
      <div className="hub-clientes__main">
        <PetsMetricsRow pets={pets} loading={loading && pets.length === 0} />

        <PetsToolbar
          searchQ={searchQ}
          onSearchChange={setSearchQ}
          speciesFilter={speciesFilter}
          onSpeciesFilterChange={setSpeciesFilter}
          tutorFilter={tutorFilter}
          onTutorFilterChange={setTutorFilter}
          situationFilter={situationFilter}
          onSituationFilterChange={setSituationFilter}
          pets={pets}
          guardians={guardians}
          onNewPet={goToNewPetWizard}
        />

        {loading ? (
          <p className="hub-clientes__muted">Carregando lista…</p>
        ) : (
          <>
            <PetsTable
              rows={paginatedRows}
              selectedId={selectedId}
              onSelect={selectPet}
              onEdit={startEditFromTable}
              onArchive={handleArchive}
              canWrite={canWrite}
            />
            <PetsPagination
              page={page}
              pageSize={pageSize}
              total={totalFiltered}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      <aside className="hub-clientes__panel">
        <div className="hub-clientes__panel-scroll">
          {panelMode === 'detail' && selectedPet ? (
            <PetDetailPanel
              pet={selectedPet}
              onClose={closePanel}
              onStartEdit={startEditFromDetail}
              onArchive={canWrite ? () => handleArchive(selectedPet) : undefined}
              canWrite={canWrite}
            />
          ) : panelMode === 'edit' && selectedPet ? (
            <>
              <div className="hub-clientes__panel-header">
                <h2 className="hub-clientes__form-title" style={{ margin: 0 }}>
                  Editar pet
                </h2>
                <button type="button" className="hub-clientes__panel-close" aria-label="Cancelar edição" onClick={cancelEdit}>
                  ×
                </button>
              </div>
              <PetForm
                key={`edit-${editingId}`}
                value={form}
                onChange={setForm}
                onSubmit={handleSubmit}
                guardians={guardians}
                submitting={submitting}
                canWrite={canWrite}
                title=""
                isEdit
                showOptionalPhoto={false}
                onCancelEdit={cancelEdit}
              />
            </>
          ) : (
            <PetForm
              key="create-pet"
              value={form}
              onChange={setForm}
              onSubmit={handleSubmit}
              guardians={guardians}
              submitting={submitting}
              canWrite={canWrite}
              title="Cadastro Rápido de Pet"
              isEdit={false}
              showOptionalPhoto
            />
          )}
        </div>
      </aside>
    </div>
  );
};

export default HubPetsPage;
