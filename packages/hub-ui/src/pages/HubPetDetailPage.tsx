import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  useAuth,
  getStoredClinicId,
  usePermissions,
  type AppRole,
} from '@petimi/web-core';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import { useAlert } from '../components/AlertProvider';
import { HubCancelButton } from '../components/HubCancelButton';
import { HubLoading } from '../components/HubLoading';
import { getSelectedUnitId } from '../utils/useSelectedUnitId';
import { hubGuardiansApi, type HubGuardian } from '../api/hubGuardiansApi';
import { hubPetsApi, type HubPet } from '../api/hubPetsApi';
import { resolvePetBodyPorteForApi } from '../data/breedDefaultSizeTier';
import type { CoatTypeValue, PetBodyPorteValue } from '../utils/hubServiceTypesPricingMatrix';
import './clientes/clientes.css';
import './pets/pets-page.css';
import '../components/hub-profile.css';
import { PetDetailPanel } from './pets/PetDetailPanel';
import { PetForm } from './pets/PetForm';
import { emptyPetForm, type PetFormValues } from './pets/PetFormValues';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

function petToForm(p: HubPet): PetFormValues {
  const st = p.size_tier;
  const sizeOk = st && (['mini', 'pequeno', 'medio', 'grande', 'gigante'] as const).includes(st as PetBodyPorteValue);
  return {
    name: p.name,
    species: p.species,
    breed: p.breed || '',
    isSRD: !(p.breed && String(p.breed).trim()),
    sex: (p.sex as PetFormValues['sex']) || '',
    birth_date: p.birth_date || '',
    notes: p.notes || '',
    behaviorTags: p.behavior_tags ?? [],
    size_tier: sizeOk ? (st as PetFormValues['size_tier']) : '',
    coat_color: p.coat_color || '',
    coat_type: p.coat_type ? (p.coat_type as CoatTypeValue) : '',
    primary_guardian_id: p.primary_guardian?.guardian_id || '',
    secondary_guardian_id: p.secondary_guardian?.guardian_id || '',
  };
}

const HubPetDetailPage: React.FC = () => {
  const { petId } = useParams<{ petId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();
  const canWrite = hasPermission('hub.pets.write');

  const [loading, setLoading] = useState(true);
  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [pet, setPet] = useState<HubPet | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PetFormValues>(emptyPetForm);
  const [submitting, setSubmitting] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId || !petId || !accessAllowed) return;
    setLoading(true);
    try {
      const [{ pets }, { guardians: gs }] = await Promise.all([
        hubPetsApi.list(clinicId, true),
        hubGuardiansApi.list(clinicId, true),
      ]);
      const found = pets.find((p) => p.id === petId) ?? null;
      setPet(found);
      setGuardians(gs);
      if (found) setForm(petToForm(found));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar pet');
      setPet(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, petId, accessAllowed, showError]);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicId || !petId || !canWrite) return;
    if (!form.name.trim() || !form.species.trim()) {
      showError('Nome e espécie são obrigatórios');
      return;
    }
    if (!form.primary_guardian_id) {
      showError('Tutor principal é obrigatório');
      return;
    }
    if (!form.isSRD && !form.breed.trim()) {
      showError('Indique a raça ou marque SRD.');
      return;
    }
    setSubmitting(true);
    try {
      const sexVal = form.sex === '' ? null : form.sex;
      const sec =
        form.secondary_guardian_id && form.secondary_guardian_id !== form.primary_guardian_id
          ? form.secondary_guardian_id
          : null;
      const sizeTier = resolvePetBodyPorteForApi(
        form.size_tier || '',
        form.species.trim(),
        form.isSRD ? '' : form.breed.trim(),
      );
      await hubPetsApi.update(petId, {
        clinic_id: clinicId,
        name: form.name.trim(),
        species: form.species.trim(),
        breed: form.isSRD ? null : form.breed.trim() || null,
        sex: sexVal,
        birth_date: form.birth_date.trim() || null,
        notes: form.notes.trim() || null,
        behavior_tags: form.behaviorTags.length ? form.behaviorTags : null,
        size_tier: sizeTier,
        coat_color: form.coat_color.trim() || null,
        coat_type: form.coat_type || null,
        primary_guardian_id: form.primary_guardian_id,
        secondary_guardian_id: sec,
      });
      showSuccess('Pet atualizado');
      setEditing(false);
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchivePet = useCallback(() => {
    if (!clinicId || !petId || !pet || !canWrite) return;
    showConfirm(`Arquivar o pet "${pet.name}"?`, () => {
      void (async () => {
        try {
          await hubPetsApi.update(petId, { clinic_id: clinicId, archived: true });
          showSuccess('Pet arquivado');
          navigate('/hub/pets');
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao arquivar');
        }
      })();
    }, 'Arquivar');
  }, [clinicId, petId, pet, canWrite, showConfirm, showSuccess, showError, navigate]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica para ver este pet.</p>
      </div>
    );
  }

  if (permLoading || !accessAllowed || loading) {
    return (
      <div style={{ padding: 24 }}>
        <HubLoading label="Carregando pet…" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Pet não encontrado.</p>
        <Link to="/hub/pets" className="hub-clientes__link-btn" style={{ display: 'inline-block', marginTop: 12 }}>
          Voltar à lista
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px' }}>
      <div className="hub-clientes__detail-page-back">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => navigate('/hub/pets')}>
          ← Voltar aos pets
        </button>
      </div>

      {editing ? (
        <div className="hub-meu-perfil__panel" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <header className="hub-meu-perfil__panel-head">
            <div>
              <h2 className="hub-meu-perfil__panel-title">Editar pet</h2>
              <p className="hub-meu-perfil__panel-sub">Atualize a ficha do pet.</p>
            </div>
          </header>
          <PetForm
            key={`edit-${pet.id}`}
            value={form}
            onChange={setForm}
            onSubmit={handleSubmit}
            submitting={submitting}
            canWrite={canWrite}
            guardians={guardians}
            isEdit
            title=""
          />
          <div style={{ marginTop: 12 }}>
            <HubCancelButton onClick={() => setEditing(false)} />
          </div>
        </div>
      ) : (
        <PetDetailPanel
          layout="page"
          pet={pet}
          onClose={() => navigate('/hub/pets')}
          onStartEdit={() => setEditing(true)}
          onOpenInNewPage={() => {}}
          hideNewPageButton
          onArchive={canWrite ? handleArchivePet : undefined}
          canWrite={canWrite}
          clinicId={clinicId}
          unitId={unitId}
          canCreateReceivable={hasPermission('hub.receivables.create')}
        />
      )}
    </div>
  );
};

export default HubPetDetailPage;
