import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Store } from 'lucide-react';
import { useAuth } from '@petimi/web-core';
import { useAlert, HubSearchableCombobox, HubCheckbox } from '@petimi/hub-ui';
import '@petimi/hub-ui/pages/clientes/clientes.css';
import '@petimi/hub-ui/pages/pets/wizard/pet-wizard.css';
import './hub-onboarding-page.css';
import HubOnboardingStepper from '../components/HubOnboardingStepper';
import HubOnboardingFooter from '../components/HubOnboardingFooter';
import HubTechnicalManagerField from '../components/HubTechnicalManagerField';
import { hubSignupApi } from '../services/hubSignupApi';
import { formatCNPJ, validateCNPJ, BRAZILIAN_UF_COMBO_OPTIONS } from '../utils/brValidators';
import { markHubOnboardingComplete } from '../utils/hubOnboardingState';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';
import { getHubUserDisplayName } from '../utils/hubUserDisplay';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubClinicOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, setAuthFromLogin } = useAuth();
  const { showError, showSuccess, showConfirm } = useAlert();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sameAddress, setSameAddress] = useState(true);
  const [isMainUnit, setIsMainUnit] = useState(true);
  const [technicalManagerSelf, setTechnicalManagerSelf] = useState(true);
  const [technicalManagerName, setTechnicalManagerName] = useState('');

  const selfDisplayName = getHubUserDisplayName(user);

  const [clinic, setClinic] = useState({
    name: '',
    cnpj: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
    description: '',
  });

  const [unit, setUnit] = useState({
    name: '',
    nickname: '',
    address: '',
    city: '',
    state: 'SP',
    phone: '',
  });

  const goToUnitStep = () => {
    if (!clinicValid) return;
    const clinicName = clinic.name.trim();
    setUnit((u) => ({
      ...u,
      name: clinicName,
      nickname: clinicName.slice(0, 40),
      ...(sameAddress
        ? { address: clinic.address, city: clinic.city, state: clinic.state }
        : {}),
    }));
    setStep(1);
  };

  useEffect(() => {
    if (!sameAddress) return;
    setUnit((u) => ({
      ...u,
      address: clinic.address,
      city: clinic.city,
      state: clinic.state,
    }));
  }, [sameAddress, clinic.address, clinic.city, clinic.state]);

  const clinicValid =
    clinic.name.trim().length >= 2 &&
    validateCNPJ(clinic.cnpj) &&
    clinic.address.trim().length >= 3 &&
    clinic.city.trim().length >= 2 &&
    clinic.state.length === 2;

  const technicalManagerResolved = technicalManagerSelf
    ? selfDisplayName.trim()
    : technicalManagerName.trim();

  const unitValid =
    unit.name.trim().length >= 2 &&
    unit.nickname.trim().length >= 1 &&
    unit.address.trim().length >= 3 &&
    unit.city.trim().length >= 2 &&
    unit.state.length === 2 &&
    technicalManagerResolved.length >= 2;

  const submit = async () => {
    if (!clinicValid || !unitValid) return;
    setLoading(true);
    try {
      const res = await hubSignupApi.completeOnboarding({
        clinic: {
          name: clinic.name.trim(),
          cnpj: clinic.cnpj,
          address: clinic.address.trim(),
          city: clinic.city.trim(),
          state: clinic.state,
          phone: clinic.phone.trim() || null,
          description: clinic.description.trim() || null,
        },
        unit: {
          name: unit.name.trim(),
          nickname: unit.nickname.trim(),
          address: unit.address.trim(),
          city: unit.city.trim(),
          state: unit.state,
          phone: unit.phone.trim() || null,
          is_main: isMainUnit,
          technical_manager: technicalManagerResolved,
        },
      });
      const clinicUser = res.clinicUser as Record<string, unknown>;
      markHubOnboardingComplete(clinicUser, String(res.unit.id));
      await setAuthFromLogin({
        user: JSON.parse(localStorage.getItem('user') || 'null'),
        session: JSON.parse(localStorage.getItem('session') || 'null'),
        clinicUser,
        onboarding: {
          clinicId: clinicUser.clinic_id ?? null,
          shouldCompleteClinicProfile: false,
          hasUnits: true,
          needsOnboarding: false,
        },
      });
      try {
        const ctx = await hubSessionApi.getContext();
        applyHubSessionContext(ctx);
      } catch {
        /* onboarding response já vinculou clínica */
      }
      showSuccess(res.message || 'Cadastro concluído');
      navigate('/hub/clientes', { replace: true });
    } catch (e: unknown) {
      showError((e as Error)?.message || 'Erro ao guardar cadastro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hub-onboarding-page-root">
      <div className="hub-onboarding-page-inner">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
            <span className="hub-login-page-tagline">CONFIGURAR CLÍNICA</span>
          </div>
        </div>

        <h1 className="hub-clientes__title">Configure sua clínica</h1>
        <p className="hub-clientes__subtitle">
          Dados da organização e da primeira unidade operacional. Pode completar detalhes adicionais depois.
        </p>

        <HubOnboardingStepper steps={['Organização', 'Primeira unidade']} activeStep={step} />

        {step === 0 ? (
          <section className="hub-onboarding-section-card">
            <div className="hub-onboarding-section-head">
              <div className="hub-onboarding-section-icon">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="hub-clientes__title" style={{ fontSize: 18, margin: 0 }}>
                  Dados da clínica
                </h2>
                <p className="hub-clientes__subtitle" style={{ margin: '4px 0 0' }}>
                  Razão social e contacto da organização
                </p>
              </div>
            </div>
            <div className="hub-onboarding-form-grid">
              <div className="hub-onboarding-field hub-onboarding-field--full">
                <label htmlFor="cl-name">Nome da clínica</label>
                <input
                  id="cl-name"
                  value={clinic.name}
                  onChange={(e) => setClinic((c) => ({ ...c, name: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="cl-cnpj">CNPJ</label>
                <input
                  id="cl-cnpj"
                  value={clinic.cnpj}
                  onChange={(e) => setClinic((c) => ({ ...c, cnpj: formatCNPJ(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="cl-phone">Telefone comercial</label>
                <input
                  id="cl-phone"
                  value={clinic.phone}
                  onChange={(e) => setClinic((c) => ({ ...c, phone: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field hub-onboarding-field--full">
                <label htmlFor="cl-addr">Endereço</label>
                <input
                  id="cl-addr"
                  value={clinic.address}
                  onChange={(e) => setClinic((c) => ({ ...c, address: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="cl-city">Cidade</label>
                <input
                  id="cl-city"
                  value={clinic.city}
                  onChange={(e) => setClinic((c) => ({ ...c, city: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="cl-uf">UF</label>
                <HubSearchableCombobox
                  id="cl-uf"
                  className="hub-combobox--clientes"
                  options={BRAZILIAN_UF_COMBO_OPTIONS}
                  value={clinic.state}
                  onChange={(v) => setClinic((c) => ({ ...c, state: v }))}
                  placeholder="Selecionar UF"
                  searchPlaceholder="Buscar estado…"
                  allowCreate={false}
                  clearable={false}
                  ariaLabel="UF da clínica"
                />
              </div>
              <div className="hub-onboarding-field hub-onboarding-field--full">
                <label htmlFor="cl-desc">Descrição (opcional)</label>
                <textarea
                  id="cl-desc"
                  value={clinic.description}
                  onChange={(e) => setClinic((c) => ({ ...c, description: e.target.value }))}
                />
              </div>
            </div>
            <HubOnboardingFooter
              primaryLabel="Continuar"
              primaryDisabled={!clinicValid}
              onPrimary={goToUnitStep}
            />
          </section>
        ) : (
          <section className="hub-onboarding-section-card">
            <div className="hub-onboarding-section-head">
              <div className="hub-onboarding-section-icon">
                <Store size={22} />
              </div>
              <div>
                <h2 className="hub-clientes__title" style={{ fontSize: 18, margin: 0 }}>
                  Primeira unidade
                </h2>
                <p className="hub-clientes__subtitle" style={{ margin: '4px 0 0' }}>
                  Unidade que aparece na agenda e no seletor do header
                </p>
              </div>
            </div>
            <div className="hub-onboarding-form-grid">
              <div className="hub-onboarding-field">
                <label htmlFor="un-name">Nome da unidade</label>
                <input
                  id="un-name"
                  value={unit.name}
                  onChange={(e) => setUnit((u) => ({ ...u, name: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="un-nick">Apelido (agenda)</label>
                <input
                  id="un-nick"
                  value={unit.nickname}
                  onChange={(e) => setUnit((u) => ({ ...u, nickname: e.target.value }))}
                  placeholder="Ex.: Matriz, Unidade Centro"
                />
              </div>
              <HubCheckbox
                className="hub-onboarding-toggle-row hub-onboarding-field--full"
                checked={sameAddress}
                onChange={setSameAddress}
              >
                Usar o mesmo endereço da clínica
              </HubCheckbox>
              <div className="hub-onboarding-field hub-onboarding-field--full">
                <label htmlFor="un-addr">Endereço</label>
                <input
                  id="un-addr"
                  value={unit.address}
                  disabled={sameAddress}
                  onChange={(e) => setUnit((u) => ({ ...u, address: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="un-city">Cidade</label>
                <input
                  id="un-city"
                  value={unit.city}
                  disabled={sameAddress}
                  onChange={(e) => setUnit((u) => ({ ...u, city: e.target.value }))}
                />
              </div>
              <div className="hub-onboarding-field">
                <label htmlFor="un-uf">UF</label>
                <HubSearchableCombobox
                  id="un-uf"
                  className="hub-combobox--clientes"
                  options={BRAZILIAN_UF_COMBO_OPTIONS}
                  value={unit.state}
                  disabled={sameAddress}
                  onChange={(v) => setUnit((u) => ({ ...u, state: v }))}
                  placeholder="Selecionar UF"
                  searchPlaceholder="Buscar estado…"
                  allowCreate={false}
                  clearable={false}
                  ariaLabel="UF da unidade"
                />
              </div>
            </div>
            <HubTechnicalManagerField
              idPrefix="onb"
              selfDisplayName={selfDisplayName}
              isSelf={technicalManagerSelf}
              onIsSelfChange={setTechnicalManagerSelf}
              name={technicalManagerName}
              onNameChange={setTechnicalManagerName}
            />
            <HubCheckbox className="hub-onboarding-toggle-row" checked={isMainUnit} onChange={setIsMainUnit}>
              Esta é a unidade principal (matriz)
            </HubCheckbox>
            <HubOnboardingFooter
              onCancel={() =>
                showConfirm(
                  'Sair da configuração? Pode concluir o cadastro da clínica mais tarde ao voltar a entrar.',
                  () => navigate('/login', { replace: true }),
                  'Cancelar configuração',
                )
              }
              showBack
              onBack={() => setStep(0)}
              backLabel="Anterior"
              primaryLabel="Concluir e entrar no Hub"
              primaryDisabled={!unitValid}
              primaryLoading={loading}
              onPrimary={() => void submit()}
            />
          </section>
        )}
      </div>
    </div>
  );
};

export default HubClinicOnboardingPage;
