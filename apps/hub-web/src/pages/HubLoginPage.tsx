import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { login, useAuth } from '@petimi/web-core';
import { getHubPostLoginDestination } from '../authNavigation';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';
import { HubCheckbox } from '@petimi/hub-ui';

const vetBase = (import.meta.env.VITE_VET_WEB_URL || '').replace(/\/$/, '');
const REMEMBER_KEY = 'petimi_hub_login_remember';
const REMEMBER_EMAIL_KEY = 'petimi_hub_login_email';
const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthFromLogin } = useAuth();

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBER_KEY) === '1';
      const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (remembered && savedEmail) {
        setRememberMe(true);
        setEmail(savedEmail);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const st = (location.state as { passwordReset?: boolean } | null)?.passwordReset;
    if (st) {
      setPasswordResetNotice(true);
    }
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPasswordResetNotice(false);
    try {
      const data = (await login({
        email: email.trim(),
        password,
      })) as Record<string, unknown>;
      await setAuthFromLogin(data);

      try {
        const ctx = await hubSessionApi.getContext();
        applyHubSessionContext(ctx);
      } catch {
        /* login payload já trouxe clinic_user quando disponível */
      }

      try {
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, '1');
          localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBER_KEY);
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        /* ignore */
      }

      const dest = getHubPostLoginDestination(data, vetBase || undefined);
      if (dest.type === 'external') {
        window.location.replace(dest.url);
      } else {
        navigate(dest.path, { replace: true });
      }
    } catch (err: unknown) {
      const msg =
        typeof (err as Error)?.message === 'string'
          ? (err as Error).message
          : 'Erro inesperado ao fazer login';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const vetForgot = vetBase ? `${vetBase}/forgot-password` : null;
  const vetSignup = vetBase ? `${vetBase}/clinic-signup` : null;
  const vetLogin = vetBase ? `${vetBase}/login` : null;

  return (
    <div className="hub-login-page-root">
      <Link to="/" className="hub-login-page-back">
        ← Início
      </Link>

      <div className="hub-login-page-card">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
            <span className="hub-login-page-tagline">OPERAÇÃO DO NEGÓCIO PET</span>
          </div>
        </div>

        <h1 className="hub-login-page-welcome">Bem-vindo de volta! 👋</h1>
        <p className="hub-login-page-subwelcome">
          Faça login para acessar sua conta PetMi Hub
        </p>

        <form onSubmit={handleLogin}>
          <div className="hub-login-page-field-block">
            <label htmlFor="hub-email" className="hub-login-page-label">
              Email
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Mail size={20} color="#c86a4d" strokeWidth={2} />
              </span>
              <input
                id="hub-email"
                type="email"
                className="hub-login-page-text-input"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="hub-login-page-field-block hub-login-page-field-block--tight">
            <label htmlFor="hub-password" className="hub-login-page-label">
              Senha
            </label>
            <div className="hub-login-page-field-row">
              <span className="hub-login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c86a4d" strokeWidth={2} />
              </span>
              <div className="hub-login-page-password-wrap">
                <input
                  id="hub-password"
                  type={showPassword ? 'text' : 'password'}
                  className="hub-login-page-password-input"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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

          <div className="hub-login-page-options">
            <HubCheckbox className="hub-login-page-remember" checked={rememberMe} onChange={setRememberMe}>
              Lembrar de mim
            </HubCheckbox>
            {vetForgot ? (
              <a href={vetForgot} className="hub-login-page-forgot">
                Esqueci minha senha
              </a>
            ) : null}
          </div>

          {passwordResetNotice && (
            <div className="hub-login-page-msg hub-login-page-msg--success">
              Senha atualizada. Faça login com a nova senha.
            </div>
          )}

          {error && <div className="hub-login-page-msg hub-login-page-msg--error">{error}</div>}

          <button type="submit" className="hub-login-page-submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
            {!loading && <ArrowRight size={20} aria-hidden />}
          </button>
        </form>

        <p className="hub-login-page-footer">
          Ainda não tem uma conta? <Link to="/signup">Criar conta no Hub →</Link>
        </p>

        {vetLogin && (
          <p className="hub-login-page-secondary">
            <a href={vetLogin}>Ir para o login PetMi Vet</a>
          </p>
        )}
      </div>
    </div>
  );
};

export default HubLoginPage;
