import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import CertificationUploader from '../components/CertificationUploader';
import { freelancerOnboardingApi } from '../services/freelancerOnboardingApi';
import { specialtiesApi, Specialty } from '../services/specialtiesApi';
import { BRAZILIAN_STATES, getCitiesByState, STATE_NAMES } from '../utils/locationData';
import { ibgeApi, IBGEState, IBGECity } from '../services/ibgeApi';
import colors from '../styles/colors';
import { Heart, ArrowRight, ArrowLeft, CheckCircle, AlertCircle, Briefcase, MapPin, Calendar, FileText, Lightbulb, LogOut, Stethoscope } from 'lucide-react';
import { useAlert } from '../hooks/useAlert';
import IconWrapper from '../components/IconWrapper';
import { useAuth } from '../AuthContext';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import RestoreProgressModal from '../components/RestoreProgressModal';

interface CertificationFile {
  file: File;
  url?: string;
  path?: string;
}

const FreelancerOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const { logout, isLoggingOut, user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedState, setSelectedState] = useState<string>('');
  const [ibgeStates, setIbgeStates] = useState<IBGEState[]>([]);
  const [ibgeCities, setIbgeCities] = useState<IBGECity[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [savedProgress, setSavedProgress] = useState<any>(null);

  const [formData, setFormData] = useState({
    specialties: [] as string[],
    service_regions: [] as string[],
    experience_year: '',
    bio: '',
    certifications: [] as string[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [certificationFiles, setCertificationFiles] = useState<CertificationFile[]>([]);

  const totalSteps = 5;
  const currentYear = new Date().getFullYear();
  const minYear = 1980;

  // Função para limpar progresso
  const clearProgress = useCallback(() => {
    localStorage.removeItem('freelancerOnboardingProgress');
  }, []);

  // Verificar se o onboarding já foi completado - se sim, redirecionar
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const status = await freelancerOnboardingApi.checkOnboardingStatus();
        
        // Se onboarding já foi completado, limpar progresso e redirecionar
        if (status.onboardingCompleted === true) {
          console.log('[FreelancerOnboardingPage] Onboarding já completado, redirecionando para dashboard');
          clearProgress();
          navigate('/freelancer-dashboard', { replace: true });
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar status do onboarding:', error);
        // Em caso de erro, permitir continuar (pode ser problema de conexão)
      }
    };
    
    checkOnboardingStatus();
  }, [navigate]);

  // Carregar especialidades de freelancer ao montar
  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const { specialties: data } = await specialtiesApi.getByCategory('freelancer');
        setSpecialties(data);
      } catch (error) {
        console.error('Erro ao carregar especialidades:', error);
      }
    };
    loadSpecialties();
  }, []);

  // Carregar estados do IBGE ao montar
  useEffect(() => {
    const loadStates = async () => {
      try {
        setLoadingStates(true);
        const states = await ibgeApi.getStates();
        setIbgeStates(states);
      } catch (error) {
        console.error('Erro ao carregar estados do IBGE:', error);
        setIbgeStates([]);
      } finally {
        setLoadingStates(false);
      }
    };
    loadStates();
  }, []);

  // Carregar cidades do IBGE quando um estado for selecionado
  useEffect(() => {
    const loadCities = async () => {
      if (!selectedState) {
        setIbgeCities([]);
        return;
      }

      try {
        setLoadingCities(true);
        const cities = await ibgeApi.getCitiesByState(selectedState);
        setIbgeCities(cities);
      } catch (error) {
        console.error(`Erro ao carregar cidades do estado ${selectedState}:`, error);
        const fallbackCities = getCitiesByState(selectedState);
        setIbgeCities(fallbackCities.map(city => ({
          id: 0,
          nome: city,
          microrregiao: {
            id: 0,
            nome: '',
            mesorregiao: {
              id: 0,
              nome: '',
              UF: {
                id: 0,
                sigla: selectedState,
                nome: STATE_NAMES[selectedState] || selectedState,
              },
            },
          },
        })));
      } finally {
        setLoadingCities(false);
      }
    };
    loadCities();
  }, [selectedState]);

  // Carregar progresso salvo do localStorage (validando userId)
  useEffect(() => {
    if (!user?.id) return;

    const saved = localStorage.getItem('freelancerOnboardingProgress');
    if (saved && saved.trim() !== '') {
      try {
        const parsed = JSON.parse(saved);
        
        // Validar se o progresso pertence ao usuário atual
        if (parsed.userId && parsed.userId !== user.id) {
          // Progresso pertence a outro usuário, limpar
          localStorage.removeItem('freelancerOnboardingProgress');
          return;
        }

        // Se pertence ao usuário atual e tem step válido, mostrar modal de restauração
        if (parsed.step && parsed.step > 1 && parsed.step < totalSteps) {
          setSavedProgress(parsed);
          setShowRestoreModal(true);
        } else {
          // Se não tem step válido, apenas restaurar dados sem mostrar modal
          if (parsed.formData) {
            setFormData(parsed.formData);
          }
          if (parsed.selectedState) {
            setSelectedState(parsed.selectedState);
          }
        }
      } catch (e) {
        console.error('Erro ao carregar progresso:', e);
        localStorage.removeItem('freelancerOnboardingProgress');
      }
    }
  }, [user?.id, totalSteps]);

  // Handler para continuar de onde parou
  const handleContinueProgress = useCallback(() => {
    if (savedProgress) {
      if (savedProgress.formData) {
        setFormData(savedProgress.formData);
      }
      if (savedProgress.selectedState) {
        setSelectedState(savedProgress.selectedState);
      }
      if (savedProgress.step) {
        setStep(savedProgress.step);
      }
    }
    setShowRestoreModal(false);
    setSavedProgress(null);
  }, [savedProgress]);

  // Função para salvar progresso manualmente
  const saveProgress = useCallback(() => {
    if (user?.id) {
      const progressData = {
        userId: user.id,
        step,
        formData,
        selectedState,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('freelancerOnboardingProgress', JSON.stringify(progressData));
    }
  }, [user?.id, step, formData, selectedState]);

  // Handler para começar do zero
  const handleStartOver = useCallback(() => {
    clearProgress();
    setFormData({
      specialties: [],
      service_regions: [],
      experience_year: '',
      bio: '',
      certifications: [],
    });
    setSelectedState('');
    setStep(1);
    setShowRestoreModal(false);
    setSavedProgress(null);
  }, [clearProgress]);

  // Salvar progresso no localStorage (com userId para validação)
  useEffect(() => {
    if (step > 1 && step < totalSteps + 1 && user?.id) {
      const progressData = {
        userId: user.id,
        step,
        formData,
        selectedState,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('freelancerOnboardingProgress', JSON.stringify(progressData));
    }
  }, [formData, selectedState, step, totalSteps, user?.id]);

  // Handler para logout - verifica se está em onboarding
  const handleLogoutClick = useCallback(() => {
    // Se está no step de sucesso (5) ou não está em onboarding, fazer logout direto
    if (step >= totalSteps) {
      logout();
      return;
    }

    // Se está em onboarding, mostrar modal
    setShowLogoutModal(true);
  }, [step, totalSteps, logout]);

  // Handler para salvar e sair
  const handleSaveAndExit = useCallback(async () => {
    saveProgress();
    setShowLogoutModal(false);
    await logout();
  }, [saveProgress, logout]);

  // Handler para sair sem salvar
  const handleExitWithoutSaving = useCallback(async () => {
    clearProgress();
    setShowLogoutModal(false);
    await logout();
  }, [clearProgress, logout]);

  // Validar step atual
  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return formData.specialties.length > 0;
      case 2:
        const hasState = selectedState !== '';
        const hasCities = formData.service_regions.some(
          region => !BRAZILIAN_STATES.includes(region) && region.endsWith(` - ${selectedState}`)
        );
        return hasState && hasCities;
      case 3:
        const year = parseInt(formData.experience_year);
        return year >= minYear && year <= currentYear;
      case 4:
        const bioLength = formData.bio.trim().length;
        return bioLength >= 100 && bioLength <= 600;
      case 5:
        return true; // Step de sucesso sempre válido
      default:
        return false;
    }
  };

  const handleNext = useCallback(() => {
    if (step < totalSteps && isStepValid()) {
      setStep(step + 1);
      setErrors({});
    } else {
      // Mostrar erros específicos
      if (step === 1 && formData.specialties.length === 0) {
        setErrors({ specialties: 'Selecione pelo menos uma especialidade' });
      } else if (step === 2) {
        const hasState = selectedState !== '';
        const hasCities = formData.service_regions.some(
          region => !BRAZILIAN_STATES.includes(region) && region.endsWith(` - ${selectedState}`)
        );
        
        if (!hasState) {
          setErrors({ service_regions: 'Selecione um estado para continuar' });
        } else if (!hasCities) {
          setErrors({ service_regions: 'Selecione pelo menos uma cidade para continuar' });
        }
      } else if (step === 3) {
        const year = parseInt(formData.experience_year);
        if (!year || year < minYear || year > currentYear) {
          setErrors({ experience_year: `Ano deve ser entre ${minYear} e ${currentYear}` });
        }
      } else if (step === 4) {
        const bioLength = formData.bio.trim().length;
        if (bioLength < 100) {
          setErrors({ bio: 'A descrição deve ter no mínimo 100 caracteres' });
        } else if (bioLength > 600) {
          setErrors({ bio: 'A descrição deve ter no máximo 600 caracteres' });
        }
      }
    }
  }, [step, totalSteps, isStepValid, formData, minYear, currentYear, certificationFiles, selectedState]);

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setErrors({});
    }
  };

  const handleCertificationsChange = async (files: CertificationFile[]) => {
    setCertificationFiles(files);
    setErrors((prev) => ({ ...prev, certifications: '' }));

    // Fazer upload de cada arquivo novo
    if (files.length > 0) {
      try {
        setUploadingFiles(true);
        const uploadedUrls: string[] = [];
        const updatedFiles: CertificationFile[] = [];

        for (const certFile of files) {
          if (certFile.url) {
            // Já tem URL, usar ela
            uploadedUrls.push(certFile.url);
            updatedFiles.push(certFile);
          } else {
            // Fazer upload do arquivo novo
            try {
              const result = await freelancerOnboardingApi.uploadCertification(certFile.file);
              uploadedUrls.push(result.url);
              updatedFiles.push({ ...certFile, url: result.url, path: result.path });
            } catch (error: any) {
              console.error('Erro ao fazer upload de certificação:', error);
              showError(`Erro ao enviar ${certFile.file.name}: ${error.message || 'Tente novamente'}`);
            }
          }
        }

        setCertificationFiles(updatedFiles);
        setFormData((prev) => ({ ...prev, certifications: uploadedUrls }));
        
        if (uploadedUrls.length > 0) {
          showSuccess(`${uploadedUrls.length} certificação(ões) enviada(s) com sucesso!`);
        }
      } catch (error: any) {
        console.error('Erro ao processar certificações:', error);
        showError('Erro ao processar certificações: ' + (error.message || 'Tente novamente'));
      } finally {
        setUploadingFiles(false);
      }
    } else {
      setFormData((prev) => ({ ...prev, certifications: [] }));
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!isStepValid()) {
      showError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    try {
      setLoading(true);

      // Coletar URLs das certificações (se houver)
      const certificationUrls = certificationFiles
        .map(f => f.url)
        .filter((url): url is string => !!url);

      // Se há arquivos selecionados mas ainda não foram enviados, aguardar
      if (certificationUrls.length === 0 && certificationFiles.length > 0) {
        showError('Aguarde o upload das certificações');
        return;
      }

      const submitData = {
        specialties: formData.specialties,
        service_regions: formData.service_regions,
        experience_year: parseInt(formData.experience_year),
        bio: formData.bio.trim(),
        certifications: certificationUrls,
      };

      const result = await freelancerOnboardingApi.completeOnboarding(submitData);

      // Limpar progresso salvo
      clearProgress();

      // Atualizar localStorage com status de onboarding completo
      const freelancerOnboardingData = {
        needsOnboarding: false,
        emailConfirmed: true,
        onboardingCompleted: true,
        approvalStatus: result.freelancer?.approval_status || 'pending_approval',
        isApproved: false,
        canAccessDashboard: false,
        canViewDemands: false,
      };
      localStorage.setItem('freelancerOnboarding', JSON.stringify(freelancerOnboardingData));

      // Ir para step de sucesso
      setStep(5);
    } catch (error: any) {
      console.error('Erro ao completar onboarding:', error);
      showError('Erro ao completar onboarding: ' + (error.message || 'Tente novamente'));
    } finally {
      setLoading(false);
    }
  }, [isStepValid, formData, certificationFiles, showError, clearProgress]);

  // Handler para tecla Enter
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      
      if (target.tagName === 'TEXTAREA' && step === 4) {
        if (event.key === 'Enter' && (event.ctrlKey || event.shiftKey)) {
          event.preventDefault();
          if (isStepValid() && !loading && !uploadingFiles) {
            handleSubmit();
          }
        }
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
          event.preventDefault();
        }

        const isButtonEnabled = isStepValid() && !loading && !uploadingFiles;
        
        if (isButtonEnabled) {
          if (step < totalSteps) {
            handleNext();
          } else if (step === totalSteps) {
            handleSubmit();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [step, totalSteps, loading, uploadingFiles, handleNext, handleSubmit, isStepValid]);

  const handleStateChange = (selected: string[]) => {
    const finalState = selected.length > 0 ? selected[selected.length - 1] : '';
    
    setSelectedState(finalState);
    
    setFormData((prev) => {
      const regionsWithoutStates = prev.service_regions.filter(
        region => !BRAZILIAN_STATES.includes(region)
      );
      
      const previousState = selectedState;
      const regionsWithoutPreviousStateCities = regionsWithoutStates.filter(
        region => !region.endsWith(` - ${previousState}`)
      );
      
      if (finalState) {
        return {
          ...prev,
          service_regions: [finalState, ...regionsWithoutPreviousStateCities],
        };
      }
      
      return {
        ...prev,
        service_regions: regionsWithoutPreviousStateCities,
      };
    });
  };

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return 'Especialidades';
      case 2:
        return 'Regiões de Atendimento';
      case 3:
        return 'Experiência Profissional';
      case 4:
        return 'Certificações e Descrição';
      case 5:
        return 'Tudo certo por aqui! ✨';
      default:
        return '';
    }
  };

  const getStepIcon = () => {
    switch (step) {
      case 1:
        return <Stethoscope size={32} color={colors.primary} />;
      case 2:
        return <MapPin size={32} color={colors.primary} />;
      case 3:
        return <Calendar size={32} color={colors.primary} />;
      case 4:
        return <FileText size={32} color={colors.primary} />;
      case 5:
        return <CheckCircle size={32} color={colors.success} />;
      default:
        return null;
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Quais são suas especialidades?</h2>
            <p style={styles.stepHint}>
              Selecione todas as áreas em que você tem experiência. Isso ajudará as clínicas a encontrarem você com mais facilidade.
            </p>
            <div style={styles.formGroup}>
              <MultiSelectDropdown
                options={specialties.map((s) => ({ id: s.id, name: s.name }))}
                selected={formData.specialties}
                onChange={(selected) => {
                  setFormData((prev) => ({ ...prev, specialties: selected }));
                  setErrors((prev) => ({ ...prev, specialties: '' }));
                }}
                placeholder="Busque e selecione suas especialidades..."
                searchPlaceholder="Buscar especialidades..."
              />
              {errors.specialties && (
                <div style={styles.errorMessage}>
                  <IconWrapper icon={AlertCircle} size={16} />
                  <span>{errors.specialties}</span>
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        const stateOptions = ibgeStates.length > 0
          ? ibgeStates.map((state) => ({
              id: state.sigla,
              name: `${state.sigla} - ${state.nome}`,
            }))
          : BRAZILIAN_STATES.map((state) => ({
              id: state,
              name: `${state} - ${STATE_NAMES[state] || state}`,
            }));

        const cityOptions = selectedState
          ? (ibgeCities.length > 0
              ? ibgeCities.map((city) => ({
                  id: `${city.nome} - ${selectedState}`,
                  name: city.nome,
                }))
              : getCitiesByState(selectedState).map((city) => ({
                  id: `${city} - ${selectedState}`,
                  name: city,
                })))
          : [];

        return (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Onde você atende?</h2>
            <p style={styles.stepHint}>
              Selecione o estado onde você atende. Você pode adicionar cidades específicas depois.
            </p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Estado</label>
              {loadingStates ? (
                <div style={styles.loadingText}>Carregando estados...</div>
              ) : (
                <MultiSelectDropdown
                  options={stateOptions}
                  selected={selectedState ? [selectedState] : []}
                  onChange={handleStateChange}
                  placeholder="Selecione um estado..."
                  searchPlaceholder="Buscar estado (ex: SP, São Paulo)..."
                  singleSelect={true}
                />
              )}
            </div>
            {selectedState && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Cidades (opcional)</label>
                {loadingCities ? (
                  <div style={styles.loadingText}>Carregando cidades...</div>
                ) : (
                  <MultiSelectDropdown
                    options={cityOptions}
                    selected={formData.service_regions.filter(region => 
                      region.endsWith(` - ${selectedState}`)
                    )}
                    onChange={(selected) => {
                      const otherRegions = formData.service_regions.filter(region => 
                        !region.endsWith(` - ${selectedState}`) && region !== selectedState
                      );
                      const newRegions = [
                        ...otherRegions,
                        ...(selected.length > 0 ? [selectedState] : []),
                        ...selected
                      ];
                      setFormData((prev) => ({ ...prev, service_regions: newRegions }));
                      setErrors((prev) => ({ ...prev, service_regions: '' }));
                    }}
                    placeholder="Selecione cidades..."
                    searchPlaceholder="Buscar cidade (ex: São Paulo, Campinas)..."
                  />
                )}
              </div>
            )}
            {errors.service_regions && (
              <div style={styles.errorMessage}>
                <IconWrapper icon={AlertCircle} size={16} />
                <span>{errors.service_regions}</span>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Quando você começou a atuar na área?</h2>
            <div style={styles.formGroup}>
              <label style={styles.label}>Ano (YYYY) <span style={styles.required}>*</span></label>
              <input
                type="number"
                min={minYear}
                max={currentYear}
                value={formData.experience_year}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData((prev) => ({ ...prev, experience_year: value }));
                  setErrors((prev) => ({ ...prev, experience_year: '' }));
                }}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value) {
                    const year = parseInt(value);
                    if (isNaN(year) || year < minYear || year > currentYear) {
                      setErrors((prev) => ({ 
                        ...prev, 
                        experience_year: `Ano deve ser entre ${minYear} e ${currentYear}` 
                      }));
                    }
                  }
                }}
                placeholder="Ex: 2018"
                style={{
                  ...styles.input,
                  ...(errors.experience_year ? styles.inputError : {}),
                }}
              />
              {errors.experience_year && (
                <div style={styles.errorMessage}>
                  <IconWrapper icon={AlertCircle} size={16} />
                  <span>{errors.experience_year}</span>
                </div>
              )}
              {formData.experience_year && !errors.experience_year && (
                <div style={styles.tooltip}>
                  <span style={styles.tooltipIcon}>
                    <IconWrapper icon={Lightbulb} size={18} color={colors.primary} />
                  </span>
                  <span style={styles.tooltipText}>
                    Você tem {currentYear - parseInt(formData.experience_year)} anos de experiência
                  </span>
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div style={styles.stepContainer}>
            <h2 style={styles.stepTitle}>Upload de Certificações e Descrição</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Upload das certificações (opcional)</label>
              <p style={styles.stepHint}>
                Envie uma foto ou arquivo da sua certificação para validação. Este campo é opcional.
              </p>
              <CertificationUploader
                onFilesChange={handleCertificationsChange}
                disabled={uploadingFiles}
              />
              {errors.certifications && (
                <div style={styles.errorMessage}>
                  <IconWrapper icon={AlertCircle} size={16} />
                  <span>{errors.certifications}</span>
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Conte um pouco sobre sua trajetória 🐾 <span style={styles.required}>*</span>
              </label>
              <p style={styles.stepHint}>
                Fale um pouco sobre sua experiência, áreas que mais gosta de atuar e o que te motiva a cuidar dos pets...
              </p>
              <textarea
                value={formData.bio}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, bio: e.target.value }));
                  setErrors((prev) => ({ ...prev, bio: '' }));
                }}
                placeholder="Fale um pouco sobre sua experiência, áreas que mais gosta de atuar e o que te motiva a cuidar dos pets..."
                rows={6}
                style={{
                  ...styles.textarea,
                  ...(errors.bio ? styles.inputError : {}),
                }}
              />
              <div style={styles.charCounter}>
                {formData.bio.length}/600 caracteres
                {formData.bio.length >= 100 && formData.bio.length <= 600 && (
                  <IconWrapper icon={CheckCircle} size={16} color={colors.success} style={{ marginLeft: '8px' }} />
                )}
                {formData.bio.length < 100 && (
                  <span style={{ color: '#ef4444', marginLeft: '8px' }}>
                    (mínimo 100 caracteres)
                  </span>
                )}
              </div>
              {errors.bio && (
                <div style={styles.errorMessage}>
                  <IconWrapper icon={AlertCircle} size={16} />
                  <span>{errors.bio}</span>
                </div>
              )}
            </div>
          </div>
        );

      case 5:
        return (
          <div style={styles.successContainer}>
            <h2 style={styles.successTitle}>Tudo certo por aqui! ✨</h2>
            <div style={styles.successMessage}>
              <p>
                Seu cadastro e documentação estão em análise pela nossa equipe, pra garantir que tudo fique certinho antes de você começar a se candidatar nas demandas.
              </p>
              <p>
                Assim que o perfil for aprovado, você vai receber um e-mail com a confirmação.
              </p>
              <p>
                Enquanto isso, pode explorar o marketplace, ver as oportunidades e conhecer melhor a plataforma.
              </p>
              <p style={styles.successFooter}>
                É uma alegria ter você fazendo parte da PetiVet! 🐾
              </p>
            </div>
            <button
              onClick={() => navigate('/freelancer-dashboard')}
              style={styles.marketplaceButton}
            >
              Ir para Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Renderizar indicador de steps
  const renderStepIndicator = () => {
    if (step === 5) return null;
    
    return (
      <div style={styles.stepIndicatorContainer}>
        {[1, 2, 3, 4].map((stepNum) => (
          <div key={stepNum} style={styles.stepIndicatorWrapper}>
            <div
              style={{
                ...styles.stepIndicatorDot,
                ...(stepNum <= step ? styles.stepIndicatorDotActive : {}),
              }}
            >
              {stepNum < step && <CheckCircle size={16} color="#ffffff" />}
            </div>
            {stepNum < 4 && (
              <div
                style={{
                  ...styles.stepIndicatorLine,
                  ...(stepNum < step ? styles.stepIndicatorLineActive : {}),
                }}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  if (step === 5) {
    return (
      <div style={styles.container}>
        <div style={styles.topHeader}>
          <div style={styles.headerContent}>
            <div style={styles.logoSection}>
              <Heart size={24} color={colors.primary} />
              <span style={styles.logoText}>PetiVet</span>
            </div>
            <button
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              style={{
                ...styles.logoutButton,
                ...(isLoggingOut ? styles.buttonDisabled : {}),
              }}
              title="Sair"
            >
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </div>
        <div style={styles.card}>
          {renderStepContent()}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.topHeader}>
        <div style={styles.headerContent}>
          <div style={styles.logoSection}>
            <Heart size={24} color={colors.primary} />
            <span style={styles.logoText}>PetiVet</span>
          </div>
          <button
            onClick={handleLogoutClick}
            disabled={isLoggingOut}
            style={{
              ...styles.logoutButton,
              ...(isLoggingOut ? styles.buttonDisabled : {}),
            }}
            title="Sair"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </div>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {getStepIcon()}
              <span>{getStepTitle()}</span>
            </div>
          </h1>
          <p style={styles.subtitle}>
            Passo {step} de {totalSteps}
          </p>
        </div>

        {renderStepIndicator()}

        <div style={styles.content}>
          {renderStepContent()}
        </div>

        <div style={styles.buttonGroup}>
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading || uploadingFiles}
              style={styles.cancelButton}
            >
              <ArrowLeft size={18} />
              Voltar
            </button>
          )}
          {step < 4 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid() || loading || uploadingFiles}
              style={{
                ...styles.submitButton,
                ...(!isStepValid() || loading || uploadingFiles ? styles.buttonDisabled : {}),
              }}
            >
              Próximo
              <ArrowRight size={18} />
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isStepValid() || loading || uploadingFiles}
              style={{
                ...styles.submitButton,
                ...(!isStepValid() || loading || uploadingFiles ? styles.buttonDisabled : {}),
              }}
            >
              {loading ? 'Enviando...' : 'Finalizar'}
              {!loading && <CheckCircle size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Modal de confirmação de logout */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onSaveAndExit={handleSaveAndExit}
        onExitWithoutSaving={handleExitWithoutSaving}
        currentStep={step}
        totalSteps={totalSteps}
      />

      {/* Modal de restauração de progresso */}
      {savedProgress && (
        <RestoreProgressModal
          isOpen={showRestoreModal}
          onClose={() => {
            setShowRestoreModal(false);
            setSavedProgress(null);
          }}
          onContinue={handleContinueProgress}
          onStartOver={handleStartOver}
          currentStep={savedProgress.step || 1}
          totalSteps={totalSteps}
          progressPercent={savedProgress.step ? Math.round((savedProgress.step / totalSteps) * 100) : 0}
        />
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    paddingTop: '100px',
  },
  topHeader: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '12px 20px',
    zIndex: 1000,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  headerContent: {
    maxWidth: '700px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '700',
    color: colors.primary,
  },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    maxWidth: '700px',
    width: '100%',
    padding: '40px',
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
  },
  stepIndicatorContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '32px',
    gap: '8px',
  },
  stepIndicatorWrapper: {
    display: 'flex',
    alignItems: 'center',
  },
  stepIndicatorDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#e5e7eb',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s',
  },
  stepIndicatorDotActive: {
    backgroundColor: colors.primary,
    color: '#ffffff',
  },
  stepIndicatorLine: {
    width: '60px',
    height: '2px',
    backgroundColor: '#e5e7eb',
    margin: '0 4px',
    transition: 'all 0.3s',
  },
  stepIndicatorLineActive: {
    backgroundColor: colors.primary,
  },
  content: {
    marginBottom: '32px',
  },
  stepContainer: {
    width: '100%',
  },
  stepTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px',
  },
  stepHint: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
    lineHeight: '1.5',
  },
  formGroup: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputError: {
    borderColor: '#ef4444',
    borderWidth: '2px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  charCounter: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
  },
  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
    padding: '8px 12px',
    backgroundColor: '#fee2e2',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#991b1b',
  },
  loadingText: {
    padding: '12px',
    fontSize: '14px',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  tooltip: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '6px',
    padding: '8px',
    backgroundColor: '#f0f9ff',
    borderLeft: '3px solid #3b82f6',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#1e40af',
  },
  tooltipIcon: {
    fontSize: '14px',
    flexShrink: 0,
    marginTop: '1px',
  },
  tooltipText: {
    lineHeight: '1.5',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#ffffff',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  submitButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  successContainer: {
    textAlign: 'center',
    padding: '32px 0',
  },
  successTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '24px',
  },
  successMessage: {
    fontSize: '16px',
    color: '#6b7280',
    lineHeight: '1.8',
    maxWidth: '600px',
    margin: '0 auto 32px',
    textAlign: 'left',
  },
  successFooter: {
    marginTop: '24px',
    fontWeight: '500',
    color: '#1f2937',
  },
  marketplaceButton: {
    padding: '14px 32px',
    backgroundColor: colors.primary,
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default FreelancerOnboardingPage;

