import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth, getStoredClinicId, usePermissions, type AppRole } from '@petimi/web-core';
import { hubGuardiansApi, type HubGuardian } from '../api/hubGuardiansApi';
import { hubPetsApi } from '../api/hubPetsApi';
import { hubQuotesApi } from '../api/hubQuotesApi';
import { resolvePetBodyPorteForApi } from '../data/breedDefaultSizeTier';
import type { CoatTypeValue } from '../utils/hubServiceTypesPricingMatrix';
import { useAlert } from '../components/AlertProvider';
import { HubCancelButton } from '../components/HubCancelButton';
import { HubLoading } from '../components/HubLoading';
import { redirectAwayFromHub } from '../utils/redirectAwayFromHub';
import './pets/pets-page.css';
import './pets/wizard/pet-wizard.css';
import { initialPetWizardState, type PetWizardState, WIZARD_STEPS } from './pets/wizard/types';
import { petToWizardState } from './pets/wizard/petToWizardState';
import { prefillPetWizardFromQuotePet } from './orcamentos/quoteToPetWizardPrefill';
import {
  clearManualQuoteConversion,
  readManualQuoteConversion,
  writeManualQuoteConversion,
} from './orcamentos/quoteManualConversionStorage';
import { PetWizardStepper } from './pets/wizard/PetWizardStepper';
import { PetWizardSummary } from './pets/wizard/PetWizardSummary';
import { PetWizardStepBasics } from './pets/wizard/steps/PetWizardStepBasics';
import { PetWizardStepHealth } from './pets/wizard/steps/PetWizardStepHealth';
import { PetWizardStepGuardians } from './pets/wizard/steps/PetWizardStepGuardians';
import { PetWizardStepDocs } from './pets/wizard/steps/PetWizardStepDocs';

function hubSafeReturnTo(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith('/hub/')) return fallback;
  if (raw.startsWith('//') || raw.includes('://')) return fallback;
  return raw;
}

const HubPetWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { petId: editPetId } = useParams<{ petId?: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(editPetId);
  const { showError, showSuccess } = useAlert();
  const { user, role: authRole } = useAuth();
  const { loading: permLoading, hasPermission } = usePermissions();
  const clinicId = getStoredClinicId();
  const canWrite = hasPermission('hub.pets.write');

  const [guardians, setGuardians] = useState<HubGuardian[]>([]);
  const [state, setState] = useState<PetWizardState>(initialPetWizardState);
  const [activeStep, setActiveStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoBlobRef = useRef<string | null>(null);
  const [editLoading, setEditLoading] = useState(isEdit);

  const accessAllowed = hasPermission('hub.pets.write');

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

  const canWriteQuotes = hasPermission('hub.quotes.write');

  const fromQuote = isEdit ? '' : searchParams.get('fromQuote')?.trim() || '';
  const petIndexRaw = searchParams.get('petIndex');
  const petIndex = Math.max(0, Number.parseInt(petIndexRaw || '0', 10) || 0);
  const guardianIdParam = searchParams.get('guardianId')?.trim() || '';
  const returnTo = hubSafeReturnTo(
    searchParams.get('returnTo'),
    isEdit && editPetId ? `/hub/pets/${editPetId}` : '/hub/pets',
  );
  const preId = isEdit ? '' : guardianIdParam;
  const prefillApplied = useRef<string | null>(null);
  useEffect(() => {
    prefillApplied.current = null;
  }, [preId]);

  useEffect(() => {
    if (isEdit) return;
    setActiveStep(0);
    setMaxReached(0);
  }, [petIndex, fromQuote, isEdit]);

  useEffect(() => {
    if (!isEdit || !clinicId || !editPetId || !accessAllowed) return;
    let cancelled = false;
    void (async () => {
      setEditLoading(true);
      try {
        const { pets } = await hubPetsApi.list(clinicId, true);
        if (cancelled) return;
        const found = pets.find((p) => p.id === editPetId) ?? null;
        if (!found) {
          showError('Pet não encontrado.');
          navigate('/hub/pets', { replace: true });
          return;
        }
        setState(petToWizardState(found));
        setMaxReached(WIZARD_STEPS.length - 1);
      } catch (e: unknown) {
        if (!cancelled) {
          showError((e as Error)?.message || 'Erro ao carregar pet');
          navigate('/hub/pets', { replace: true });
        }
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, clinicId, editPetId, accessAllowed, showError, navigate]);

  useEffect(() => {
    if (fromQuote && clinicId && petIndex === 0) {
      clearManualQuoteConversion(fromQuote);
    }
  }, [fromQuote, clinicId, petIndex]);

  useEffect(() => {
    if (!fromQuote || !clinicId || !guardianIdParam) return;
    let cancelled = false;
    void (async () => {
      try {
        const { quote } = await hubQuotesApi.get(fromQuote, clinicId);
        if (cancelled) return;
        const petsSorted = [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const p = petsSorted[petIndex];
        if (!p) {
          showError('Este pet não existe neste orçamento.');
          return;
        }
        setState({
          ...initialPetWizardState(),
          ...prefillPetWizardFromQuotePet(p),
          primary_guardian_id: guardianIdParam,
          secondary_guardian_id: '',
        });
        setPhotoPreview(null);
        if (photoBlobRef.current) {
          URL.revokeObjectURL(photoBlobRef.current);
          photoBlobRef.current = null;
        }
      } catch (e: unknown) {
        if (!cancelled) showError((e as Error)?.message || 'Erro ao carregar orçamento');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromQuote, clinicId, petIndex, guardianIdParam, showError]);

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
      if (!isEdit && !state.neutered) return 'Indique se o pet é castrado.';
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
    if (!isEdit && fromQuote && !guardianIdParam) {
      showError('Fluxo do orçamento incompleto: falta o tutor. Volte a Clientes.');
      return;
    }
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
      const sizeTier = resolvePetBodyPorteForApi(state.size || '', state.species.trim(), state.isSRD ? '' : state.breed.trim());

      const payload = {
        clinic_id: clinicId,
        name: state.name.trim(),
        species: state.species.trim(),
        breed: breedVal,
        sex: sexVal,
        notes: notesVal,
        size_tier: sizeTier,
        coat_color: state.coatColor.trim() || null,
        coat_type: state.coatType.trim() ? (state.coatType as CoatTypeValue) : null,
        primary_guardian_id: state.primary_guardian_id,
        secondary_guardian_id: sec,
        behavior_tags: state.behaviorTags.length ? state.behaviorTags : null,
      };

      if (isEdit && editPetId) {
        await hubPetsApi.update(editPetId, {
          ...payload,
          birth_date: state.birth_date.trim() || null,
        });
        showSuccess('Pet atualizado');
        navigate(returnTo);
        return;
      }

      const { pet } = await hubPetsApi.create({
        ...payload,
        birth_date: state.birth_date.trim() || undefined,
      });

      if (fromQuote && guardianIdParam) {
        const { quote } = await hubQuotesApi.get(fromQuote, clinicId);
        const petsSorted = [...(quote.pets ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const qp = petsSorted[petIndex];
        if (!qp) {
          showError('Pet do orçamento não encontrado.');
          return;
        }
        const prev = readManualQuoteConversion(fromQuote) ?? { guardian_id: guardianIdParam, links: [] };
        if (prev.guardian_id !== guardianIdParam) {
          showError('Sessão do fluxo do orçamento inconsistente. Volte a Clientes e recomece.');
          clearManualQuoteConversion(fromQuote);
          return;
        }
        const links = [...prev.links, { quote_pet_id: qp.id, hub_pet_id: pet.id }];
        writeManualQuoteConversion(fromQuote, { guardian_id: guardianIdParam, links });

        if (petIndex + 1 < petsSorted.length) {
          showSuccess(`Pet ${petIndex + 1} de ${petsSorted.length} registado — continue com o próximo.`);
          navigate(
            `/hub/pets/novo?fromQuote=${encodeURIComponent(fromQuote)}&guardianId=${encodeURIComponent(guardianIdParam)}&petIndex=${petIndex + 1}`
          );
          return;
        }

        if (!canWriteQuotes) {
          showError(
            'Pets criados, mas não tem permissão para fechar o orçamento na API. Peça a um gestor para finalizar a conversão.',
          );
          navigate(`/hub/orcamentos/${fromQuote}`);
          return;
        }
        await hubQuotesApi.finalizeManualConversion(fromQuote, {
          clinic_id: clinicId,
          guardian_id: guardianIdParam,
          manual_pet_links: links,
        });
        clearManualQuoteConversion(fromQuote);
        showSuccess('Orçamento convertido com sucesso');
        navigate(`/hub/orcamentos/${fromQuote}`);
        return;
      }

      showSuccess('Pet criado com sucesso');
      navigate('/hub/pets', { replace: false });
    } catch (e: unknown) {
      showError((e as Error)?.message || (isEdit ? 'Erro ao atualizar pet' : 'Erro ao criar pet'));
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

  if (permLoading || !accessAllowed || editLoading) {
    return (
      <div className="hub-clientes hub-pets-page" style={{ padding: 24 }}>
        <HubLoading label={isEdit ? 'Carregando pet…' : 'Carregando…'} />
      </div>
    );
  }

  if (!canWrite) {
    return <Navigate to="/hub/pets" replace />;
  }

  if (fromQuote && !guardianIdParam) {
    return (
      <div className="hub-clientes hub-pets-page" style={{ padding: 24 }}>
        <p className="hub-clientes__muted">Este fluxo do orçamento precisa do tutor na URL. Volte a Clientes e continue a partir do orçamento.</p>
        <button type="button" className="pet-wizard__btn pet-wizard__btn--primary" onClick={() => navigate('/hub/clientes')}>
          Ir a Clientes
        </button>
      </div>
    );
  }

  const stepContent = () => {
    switch (activeStep) {
      case 0:
        return <PetWizardStepBasics state={state} update={update} photoPreview={photoPreview} onPhotoChange={onPhotoChange} isEdit={isEdit} />;
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
      {fromQuote ? (
        <div className="hub-clientes__draft-banner" style={{ margin: '0 0 12px' }} role="status">
          <p style={{ margin: 0 }}>
            <strong>Conversão do orçamento</strong> — confirme a <strong>data de nascimento</strong> e os restantes
            dados; a idade indicada no orçamento é apenas orientativa.
          </p>
        </div>
      ) : null}
      <PetWizardStepper
        activeStep={activeStep}
        maxReached={maxReached}
        onSelect={setActiveStep}
        ariaLabel={isEdit ? 'Passos da edição' : 'Passos do cadastro'}
      />

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
        <HubCancelButton onClick={() => navigate(isEdit ? returnTo : '/hub/pets')} />
        <div className="pet-wizard__footer-right">
          {activeStep > 0 && (
            <button type="button" className="pet-wizard__btn pet-wizard__btn--outline" onClick={goBack}>
              <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              Anterior
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              className={`pet-wizard__btn ${isEdit ? 'pet-wizard__btn--outline' : 'pet-wizard__btn--primary'}`}
              onClick={goNext}
            >
              Próximo
              <ChevronRight size={18} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          {isEdit || isLast ? (
            <button
              type="button"
              className="pet-wizard__btn pet-wizard__btn--primary"
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Salvando…' : isEdit ? (
                'Salvar alterações'
              ) : (
                <>
                  Concluir cadastro
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </>
              )}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
};

export default HubPetWizardPage;
