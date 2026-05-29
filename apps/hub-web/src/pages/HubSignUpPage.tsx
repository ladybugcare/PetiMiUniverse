import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Phone, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import '@petimi/hub-ui/pages/pets/wizard/pet-wizard.css';
import './hub-onboarding-page.css';
import HubOnboardingStepper from '../components/HubOnboardingStepper';
import HubOnboardingFooter from '../components/HubOnboardingFooter';
import { hubSignupApi } from '../services/hubSignupApi';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubSignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const canStep0 = fullName.trim().length >= 2;
  const canStep1 =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    password.length >= 8 &&
    password === confirmPassword;

  const submit = async () => {
    if (!canStep1) return;
    setLoading(true);
    setError(null);
    try {
      const res = await hubSignupApi.signup({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || null,
      });
      setDoneMessage(res.message);
      setDone(true);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="hub-login-page-root">
        <div className="hub-login-page-card hub-onboarding-wide-card">
          <CheckCircle2 className="hub-onboarding-success-icon" size={56} />
          <h1 className="hub-login-page-welcome" style={{ textAlign: 'center' }}>
            Conta criada
          </h1>
          <p className="hub-login-page-subwelcome" style={{ textAlign: 'center' }}>
            {doneMessage}
          </p>
          <Link to="/login" className="hub-login-page-submit" style={{ marginTop: 24, textDecoration: 'none' }}>
            Ir para o login
            <ArrowRight size={20} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-login-page-root">
      <Link to="/login" className="hub-login-page-back">
        ← Voltar ao login
      </Link>

      <div className="hub-login-page-card hub-onboarding-wide-card">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
            <span className="hub-login-page-tagline">CRIAR CONTA</span>
          </div>
        </div>

        <h1 className="hub-login-page-welcome">Criar conta no Hub</h1>
        <p className="hub-login-page-subwelcome">
          Você será o administrador da clínica (responsável pela conta).
        </p>

        <HubOnboardingStepper steps={['Seus dados', 'Acesso']} activeStep={step} />

        {step === 0 ? (
          <div>
            <div className="hub-login-page-field-block">
              <label htmlFor="su-name" className="hub-login-page-label">
                Nome completo
              </label>
              <div className="hub-login-page-field-row">
                <span className="hub-login-page-field-icon" aria-hidden>
                  <User size={20} color="#c86a4d" />
                </span>
                <input
                  id="su-name"
                  className="hub-login-page-text-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </div>
            </div>
            <div className="hub-login-page-field-block">
              <label htmlFor="su-phone" className="hub-login-page-label">
                Telefone (opcional)
              </label>
              <div className="hub-login-page-field-row">
                <span className="hub-login-page-field-icon" aria-hidden>
                  <Phone size={20} color="#c86a4d" />
                </span>
                <input
                  id="su-phone"
                  className="hub-login-page-text-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  autoComplete="tel"
                />
              </div>
            </div>
            <HubOnboardingFooter
              onCancel={() => navigate('/login')}
              primaryLabel="Continuar"
              primaryDisabled={!canStep0}
              onPrimary={() => setStep(1)}
            />
          </div>
        ) : (
          <div>
            <div className="hub-login-page-field-block">
              <label htmlFor="su-email" className="hub-login-page-label">
                E-mail
              </label>
              <div className="hub-login-page-field-row">
                <span className="hub-login-page-field-icon" aria-hidden>
                  <Mail size={20} color="#c86a4d" />
                </span>
                <input
                  id="su-email"
                  type="email"
                  className="hub-login-page-text-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@clinica.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div className="hub-login-page-field-block hub-login-page-field-block--tight">
              <label htmlFor="su-pass" className="hub-login-page-label">
                Senha
              </label>
              <div className="hub-login-page-field-row">
                <span className="hub-login-page-field-icon" aria-hidden>
                  <Lock size={20} color="#c86a4d" />
                </span>
                <div className="hub-login-page-password-wrap">
                  <input
                    id="su-pass"
                    type={showPassword ? 'text' : 'password'}
                    className="hub-login-page-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="hub-login-page-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="hub-login-page-field-block hub-login-page-field-block--tight">
              <label htmlFor="su-pass2" className="hub-login-page-label">
                Confirmar senha
              </label>
              <div className="hub-login-page-field-row">
                <span className="hub-login-page-field-icon" aria-hidden>
                  <Lock size={20} color="#c86a4d" />
                </span>
                <input
                  id="su-pass2"
                  type="password"
                  className="hub-login-page-text-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {password && confirmPassword && password !== confirmPassword && (
              <p className="hub-login-page-msg hub-login-page-msg--error">As senhas não coincidem.</p>
            )}
            {error && <p className="hub-login-page-msg hub-login-page-msg--error">{error}</p>}
            <HubOnboardingFooter
              onCancel={() => navigate('/login')}
              showBack
              onBack={() => setStep(0)}
              primaryLabel="Criar conta"
              primaryDisabled={!canStep1}
              primaryLoading={loading}
              onPrimary={() => void submit()}
            />
          </div>
        )}

        <p className="hub-login-page-footer">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
};

export default HubSignUpPage;
