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
import { HubLoading } from '../components/HubLoading';
import { getSelectedUnitId } from '../utils/useSelectedUnitId';
import { hubPetsApi, type HubPet } from '../api/hubPetsApi';
import './clientes/clientes.css';
import './pets/pets-page.css';
import '../components/hub-profile.css';
import { PetDetailPanel } from './pets/PetDetailPanel';

const HubPetDetailPage: React.FC = () => {
  const { petId } = useParams<{ petId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const unitId = getSelectedUnitId();
  const canWrite = hasPermission('hub.pets.write');

  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<HubPet | null>(null);

  const accessAllowed = hasPermission('hub.pets.read');

  const load = useCallback(async () => {
    if (!clinicId || !petId || !accessAllowed) return;
    setLoading(true);
    try {
      const { pets } = await hubPetsApi.list(clinicId, true);
      setPet(pets.find((p) => p.id === petId) ?? null);
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
    <div className="hub-clientes__detail-page">
      <div className="hub-clientes__detail-page-back">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => navigate('/hub/pets')}>
          ← Voltar aos pets
        </button>
      </div>

      <PetDetailPanel
        layout="page"
        pet={pet}
        onClose={() => navigate('/hub/pets')}
        onStartEdit={() => navigate(`/hub/pets/${pet.id}/editar`)}
        onOpenInNewPage={() => {}}
        hideNewPageButton
        onArchive={canWrite ? handleArchivePet : undefined}
        canWrite={canWrite}
        clinicId={clinicId}
        unitId={unitId}
        canCreateReceivable={hasPermission('hub.receivables.create')}
      />
    </div>
  );
};

export default HubPetDetailPage;
