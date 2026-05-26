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
import { hubGuardiansApi, type HubGuardian, type HubGuardianPet } from '../api/hubGuardiansApi';
import './clientes/clientes.css';
import { GuardianDetailPanel } from './clientes/GuardianDetailPanel';
import {
  GuardianCreateForm,
  guardianToFormValues,
  type GuardianFormValues,
} from './clientes/GuardianCreateForm';
import { formValuesToUpdatePayload } from './clientes/guardianFormPayload';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

const HubGuardianDetailPage: React.FC = () => {
  const { guardianId } = useParams<{ guardianId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess, showConfirm } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.guardians.write');

  const [loading, setLoading] = useState(true);
  const [guardian, setGuardian] = useState<HubGuardian | null>(null);
  const [pets, setPets] = useState<HubGuardianPet[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GuardianFormValues | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const load = useCallback(async () => {
    if (!clinicId || !guardianId || !accessAllowed) return;
    setLoading(true);
    try {
      const res = await hubGuardiansApi.getById(guardianId, clinicId);
      setGuardian(res.guardian);
      setPets(res.pets);
      setForm(guardianToFormValues(res.guardian));
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao carregar cliente');
      setGuardian(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, guardianId, accessAllowed, showError]);

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
    if (!clinicId || !guardianId || !form || !canWrite) return;
    setSubmitting(true);
    try {
      await hubGuardiansApi.update(guardianId, formValuesToUpdatePayload(form, clinicId));
      showSuccess('Cliente atualizado');
      setEditing(false);
      await load();
    } catch (err: unknown) {
      showError((err as Error)?.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveGuardian = useCallback(() => {
    if (!clinicId || !guardianId || !guardian || !canWrite) return;
    showConfirm(`Arquivar o cliente "${guardian.full_name}"?`, () => {
      void (async () => {
        try {
          await hubGuardiansApi.update(guardianId, { clinic_id: clinicId, archived: true });
          showSuccess('Cliente arquivado');
          navigate('/hub/clientes');
        } catch (e: unknown) {
          showError((e as Error)?.message || 'Erro ao arquivar');
        }
      })();
    }, 'Arquivar');
  }, [clinicId, guardianId, guardian, canWrite, showConfirm, showSuccess, showError, navigate]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Selecione uma clínica para ver este cliente.</p>
      </div>
    );
  }

  if (permLoading || !accessAllowed || loading) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  if (!guardian || !form) {
    return (
      <div className="hub-clientes" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Cliente não encontrado.</p>
        <Link to="/hub/clientes" className="hub-clientes__link-btn" style={{ display: 'inline-block', marginTop: 12 }}>
          Voltar à lista
        </Link>
      </div>
    );
  }

  return (
    <div className="hub-clientes" style={{ flexDirection: 'column', maxWidth: 720, margin: '0 auto' }}>
      <div className="hub-clientes__detail-page-back">
        <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" onClick={() => navigate('/hub/clientes')}>
          ← Voltar aos clientes
        </button>
      </div>

      {editing ? (
        <>
          <div
            style={{
              background: 'var(--hc-card)',
              border: '1px solid var(--hc-border)',
              borderRadius: 'var(--hc-radius)',
              padding: 24,
            }}
          >
            <GuardianCreateForm
              value={form}
              onChange={setForm}
              onSubmit={handleSubmit}
              submitting={submitting}
              canWrite={canWrite}
              title=""
            />
            <button type="button" className="hub-clientes__btn hub-clientes__btn--ghost" style={{ marginTop: 12 }} onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div
          className="hub-clientes__panel"
          style={{
            width: '100%',
            maxWidth: 440,
            position: 'static',
            maxHeight: 'none',
            margin: '0 auto',
          }}
        >
          <div className="hub-clientes__panel-scroll">
            <GuardianDetailPanel
              guardian={guardian}
              pets={pets}
              onClose={() => navigate('/hub/clientes')}
              onStartEdit={() => setEditing(true)}
              onOpenInNewPage={() => {}}
              hideNewPageButton
              onArchive={canWrite ? handleArchiveGuardian : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HubGuardianDetailPage;
