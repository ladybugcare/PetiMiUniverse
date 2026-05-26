import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { hubGuardiansApi, type HubGuardian } from '../api/hubGuardiansApi';
import { hubPetsApi } from '../api/hubPetsApi';
import { useAlert } from '../components/AlertProvider';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import './pets/pets-page.css';
import './pets/wizard/pet-wizard.css';
import { initialPetWizardState, type PetWizardState, WIZARD_STEPS } from './pets/wizard/types';
import { PetWizardStepper } from './pets/wizard/PetWizardStepper';
import { PetWizardSummary } from './pets/wizard/PetWizardSummary';
import { PetWizardStepBasics } from './pets/wizard/steps/PetWizardStepBasics';
import { PetWizardStepHealth } from './pets/wizard/steps/PetWizardStepHealth';
import { PetWizardStepGuardians } from './pets/wizard/steps/PetWizardStepGuardians';
import { PetWizardStepDocs } from './pets/wizard/steps/PetWizardStepDocs';

const allowedClinicRoles = ['CADMIN', 'CMANAGER', 'CASSISTANT'] as const;

const HubPetWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showError, showSuccess } = useAlert();
  const { user, role: authRole } = useAuth();
  const { role: clinicRole, loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.pets.write');

  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [state, setState] = useState<PetWizardState>(initialPetWizardState);
  const [activeStep, setActiveStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoBlobRef = useRef<string | null>(null);

  const accessAllowed =
    clinicRole && allowedClinicRoles.includes(clinicRole as (typeof allowedClinicRoles)[number]);

  const update = useCallback((p: Partial<PetWizardState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const onPhotoChange = useCallback((file: File | null) => {
    if (photoBlobRef.current) {
      URL.revokeObjectURL(photoBlobRef.current);
      photoBlobRef.current = null;
    }
    if (!file) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    photoBlobRef.current = url;
    setPhotoPreview(url);
  }, []);

  useEffect(() => {
    return () => {
      if (photoBlobRef.current) URL.revokeObjectURL(photoBlobRef.current);
    };
  }, []);

  useEffect(() => {
    if (permLoading) return;
    if (!accessAllowed) {
      redirectAwayFromHub(authRole as AppRole);
    }
  }, [permLoading, accessAllowed, authRole]);

  useEffect(() => {
    if (!clinicId || !accessAllowed) return;
    void (async () => {
      const res = await hubGuardiansApi.list(clinicId, true);
      setGuardians(res.guardians || []);
    })();
  }, [clinicId, accessAllowed]);

  const preId = searchParams.get('guardianId');
  const prefillApplied = useRef<string | null>(null);
  useEffect(() => {
    prefillApplied.current = null;
  }, [preId]);

  useEffect(() => {
    if (!preId || guardians.length === 0) return;
    if (prefillApplied.current === preId) return;
    if (!guardians.some((g) => g.id === preId)) return;
    update({ primary_guardian_id: preId });
    prefillApplied.current = preId;
  }, [preId, guardians, update]);

  const primaryName = useMemo(() => {
    const g = guardians.find((x) => x.id === state.primary_guardian_id);
    return g?.full_name ?? '';
  }, [guardians, state.primary_guardian_id]);

  const secondaryName = useMemo(() => {
    const g = guardians.find((x) => x.id === state.secondary_guardian_id);
    return g?.full_name ?? '';
  }, [guardians, state.secondary_guardian_id]);

  const validateStep = (step: number): string | null => {
    if (step === 0) {
      if (!state.name.trim()) return 'Indique o nome do pet.';
      if (!state.species.trim()) return 'Indique a espécie.';
      if (!state.isSRD && !state.breed.trim()) return 'Indique a raça ou active SRD.';
      if (!state.sex) return 'selecione o sexo.';
      if (!state.neutered) return 'Indique se o pet é castrado.';
      if (!state.birth_date.trim()) return 'Indique a data de nascimento.';
    }
    if (step === 2) {
      if (!state.primary_guardian_id) return 'selecione o tutor principal.';
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(activeStep);
    if (err) {
      showError(err);
      return;
    }
    const next = Math.min(activeStep + 1, WIZARD_STEPS.length - 1);
    setActiveStep(next);
    setMaxReached((m) => Math.max(m, next));
  };

  const goBack = () => {
    setActiveStep((s) => Math.max(0, s - 1));
  };

  const handleSubmit = async () => {
    const err = validateStep(0) || validateStep(2);
    if (err) {
      showError(err);
      return;
    }
    if (!clinicId || !canWrite) return;
    setSubmitting(true);
    try {
      const sexVal = state.sex === '' ? null : state.sex;
      const sec =
        state.secondary_guardian_id && state.secondary_guardian_id !== state.primary_guardian_id
          ? state.secondary_guardian_id
          : null;
      const breedVal = state.isSRD ? null : state.breed.trim() || null;
      const obsParts = [state.otherObservations.trim(), state.notes.trim()].filter(Boolean);
      const notesVal = obsParts.length ? obsParts.join('\n\n') : null;

      await hubPetsApi.create({
        clinic_id: clinicId,
        name: state.name.trim(),
        species: state.species.trim(),
        breed: breedVal,
        sex: sexVal,
        birth_date: state.birth_date.trim() || undefined,
        notes: notesVal,
        primary_guardian_id: state.primary_guardian_id,
        secondary_guardian_id: sec,
      });
      showSuccess('Pet criado com sucesso');
      navigate('/hub/pets', { replace: false });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao criar pet');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!permLoading && !clinicId) {
    return <Navigate to="/hub/pets" replace />;
  }

  if (permLoading || !accessAllowed) {
    return (
      <div className="hub-clientes hub-pets-page" style={{ padding: 24 }}>
        Carregando…
      </div>
    );
  }

  if (!canWrite) {
    return <Navigate to="/hub/pets" replace />;
  }

  const stepContent = () => {
    switch (activeStep) {
      case 0:
        return <PetWizardStepBasics state={state} update={update} photoPreview={photoPreview} onPhotoChange={onPhotoChange} />;
      case 1:
        return <PetWizardStepHealth />;
      case 2:
        return <PetWizardStepGuardians state={state} update={update} guardians={guardians} />;
      case 3:
        return <PetWizardStepDocs state={state} update={update} />;
      default:
        return null;
    }
  };

  const isLast = activeStep === WIZARD_STEPS.length - 1;

  return (
    <div className="hub-clientes hub-pets-page pet-wizard">
      <PetWizardStepper activeStep={activeStep} maxReached={maxReached} onSelect={setActiveStep} />

      <div className="pet-wizard__middle">
        <div className="pet-wizard__grid">
          <div className="pet-wizard__main">
            <div className="pet-wizard__step-card">{stepContent()}</div>
          </div>
          <PetWizardSummary
            state={state}
            photoPreview={photoPreview}
            primaryName={primaryName}
            secondaryName={secondaryName}
            saveLaterDisabled
          />
        </div>
      </div>

      <footer className="pet-wizard__footer">
        <button
          type="button"
          className="pet-wizard__btn pet-wizard__btn--outline"
          onClick={() => navigate('/hub/pets')}
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          Cancelar
        </button>
        <div className="pet-wizard__footer-right">
          {activeStep > 0 && (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--outline" onClick={goBack}>
              <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              Anterior
            </button>
          )}
          {!isLast ? (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--primary" onClick={goNext}>
              Próximo
              <ChevronRight size={18} strokeWidth={2} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              className="pet-wizard__btn pet-wizard__btn--primary"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Salvando…' : (
                <>
                  Concluir cadastro
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default HubPetWizardPage;
