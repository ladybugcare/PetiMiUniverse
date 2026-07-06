import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, Phone, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { hubInvitationsApi } from '../services/hubInvitationsApi';
import { getHubPostLoginDestination } from '../authNavigation';
import { HubBrPhoneInput } from '@petimi/hub-ui';
import './hub-onboarding-page.css';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubInviteSignUpPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [clinicLabel, setClinicLabel] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  const inviteBackHref = `/accept-invitation?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) {
      setPreviewError('Token de convite inválido.');
      setLoadingPreview(false);
      return;
    }
    void hubInvitationsApi
      .preview(token)
      .then((p) => {
        if (p.blocked || p.account_exists) {
          setPreviewError(
            'Este e-mail já possui conta. No MVP, o convite é apenas para novos usuários.',
          );
          return;
        }
        setInviteEmail(p.invitation.email);
        setClinicLabel(p.clinic_name || 'a clínica');
      })
      .catch((e: unknown) => {
        setPreviewError((e as Error)?.message || 'Convite inválido ou expirado.');
      })
      .finally(() => setLoadingPreview(false));
  }, [token]);

  const canSubmit =
    fullName.trim().length >= 2 &&
    password.length >= 8 &&
    password === confirmPassword &&
    Boolean(token);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await hubInvitationsApi.signup({
        token,
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || null,
      });
      setDoneMessage(res.message);
      setDone(true);
      if (res.email_confirmed) {
        const dest = getHubPostLoginDestination(
          { clinicUser: res.clinic_user, onboarding: { shouldCompleteClinicProfile: false } },
          undefined,
        );
        if (dest.type === 'internal') {
          setTimeout(() => navigate(dest.path), 1200);
        }
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Erro ao criar conta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <div className="hub-login-page-root">
        <div className="hub-login-page-card">
          <p className="hub-login-page-subwelcome" style={{ marginBottom: 0 }}>
            Carregando…
          </p>
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className="hub-login-page-root">
        <Link to="/login" className="hub-login-page-back">
          ← Ir para o login
        </Link>
        <div className="hub-login-page-card">
          <div className="hub-login-page-logo-row">
            <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
            <div className="hub-login-page-brand-block">
              <span className="hub-login-page-brand-name">PetMi Hub</span>
              <span className="hub-login-page-tagline">CONVITE DA EQUIPE</span>
            </div>
          </div>
          <h1 className="hub-login-page-welcome">Não foi possível continuar</h1>
          <p className="hub-login-page-msg hub-login-page-msg--error">{previewError}</p>
          <Link to="/login" className="hub-login-page-submit" style={{ marginTop: 24, textDecoration: 'none' }}>
            Ir para o login
            <ArrowRight size={20} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="hub-login-page-root">
        <div className="hub-login-page-card">
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
      <Link to={inviteBackHref} className="hub-login-page-back">
        ← Voltar ao convite
      </Link>

      <div className="hub-login-page-card">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
            <span className="hub-login-page-tagline">CONVITE DA EQUIPE</span>
          </div>
        </div>

        <h1 className="hub-login-page-welcome">Criar conta</h1>
        <p className="hub-login-page-subwelcome">
          Você está entrando na equipe de <strong>{clinicLabel}</strong>. A clínica já está configurada — basta
          criar seu acesso.
        </p>

        <form onSubmit={(e) => void submit(e)}>
          <div className="hub-login-page-field-block">
            <label htmlFor="inv-email" className="hub-login-page-label">
              E-mail (convite)
            </label>
            <div className="hub-login-page-field-row hub-login-page-field-row--readonly">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Mail size={20} color="#c86a4d" />
              </span>
              <input
                id="inv-email"
                type="email"
                className="hub-login-page-text-input"
                value={inviteEmail}
                readOnly
                tabIndex={-1}
                aria-readonly
              />
            </div>
          </div>

          <div className="hub-login-page-field-block">
            <label htmlFor="inv-name" className="hub-login-page-label">
              Nome completo
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <User size={20} color="#c86a4d" />
              </span>
              <input
                id="inv-name"
                type="text"
                className="hub-login-page-text-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                required
                minLength={2}
                autoComplete="name"
              />
            </div>
          </div>

          <div className="hub-login-page-field-block">
            <label htmlFor="inv-phone" className="hub-login-page-label">
              Celular (opcional)
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Phone size={20} color="#c86a4d" />
              </span>
              <HubBrPhoneInput
                id="inv-phone"
                className="hub-login-page-text-input"
                value={phone}
                onChange={setPhone}
              />
            </div>
          </div>

          <div className="hub-login-page-field-block hub-login-page-field-block--tight">
            <label htmlFor="inv-pass" className="hub-login-page-label">
              Senha
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c86a4d" />
              </span>
              <div className="hub-login-page-password-wrap">
                <input
                  id="inv-pass"
                  type={showPassword ? 'text' : 'password'}
                  className="hub-login-page-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
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
            <label htmlFor="inv-pass2" className="hub-login-page-label">
              Confirmar senha
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c86a4d" />
              </span>
              <input
                id="inv-pass2"
                type="password"
                className="hub-login-page-text-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </div>

          {password && confirmPassword && password !== confirmPassword && (
            <p className="hub-login-page-msg hub-login-page-msg--error">As senhas não coincidem.</p>
          )}
          {error && <p className="hub-login-page-msg hub-login-page-msg--error">{error}</p>}

          <button type="submit" className="hub-login-page-submit" disabled={!canSubmit || submitting}>
            {submitting ? 'Criando conta…' : 'Criar conta e entrar na equipe'}
            {!submitting && <ArrowRight size={20} aria-hidden />}
          </button>
        </form>

        <p className="hub-login-page-footer">
          <Link to={inviteBackHref}>Voltar ao convite</Link>
        </p>
      </div>
    </div>
  );
};

export default HubInviteSignUpPage;
