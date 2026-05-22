import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { login } from '../services/api';
import { useAuth } from '../AuthContext';
import { getDashboardPathForRole, getUserRole } from '../utils/authHelpers';

const REMEMBER_KEY = 'petimi_login_remember';
const REMEMBER_EMAIL_KEY = 'petimi_login_email';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordResetNotice, setPasswordResetNotice] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
      const data = await login({
        email: email.trim(),
        password,
      });

      await setAuthFromLogin(data);

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

      const nextUser = data?.user;
      const dest = nextUser ? getDashboardPathForRole(getUserRole(nextUser)) : '/';
      navigate(dest, { replace: true });
    } catch (err: any) {
      const msg =
        typeof err?.message === 'string' ? err.message : 'Erro inesperado ao fazer login';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-root">
      <Link to="/" className="login-page-back">
        ← Início
      </Link>

      <div className="login-page-card">
        <div className="login-page-logo-row">
          {/* Mesmo ficheiro que `frontend/assets/favicon.png` — servido em `public/favicon.png` */}
          <img
            src={`${process.env.PUBLIC_URL || ''}/favicon.png`}
            alt="PetMi"
            className="login-page-logo-img"
          />
          <div className="login-page-brand-block">
            <span className="login-page-brand-name">PetMi Vet</span>
            <span className="login-page-tagline">CUIDADO QUE CONECTA</span>
          </div>
        </div>

        <h1 className="login-page-welcome">Bem-vindo de volta! 👋</h1>
        <p className="login-page-subwelcome">
          Faça login para acessar sua conta PetMi Vet
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="login-email" className="login-page-label">
              Email
            </label>
            <div className="login-page-field-row">
              <span className="login-page-field-icon" aria-hidden>
                <Mail size={20} color="#c46c6a" strokeWidth={2} />
              </span>
              <input
                id="login-email"
                type="email"
                className="input login-page-text-input"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div style={{ marginBottom: '4px' }}>
            <label htmlFor="login-password" className="login-page-label">
              Senha
            </label>
            <div className="login-page-field-row">
              <span className="login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c46c6a" strokeWidth={2} />
              </span>
              <div className="login-page-password-slot">
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(value) => setPassword(value)}
                  placeholder="Digite sua senha"
                  required
                  autoComplete="current-password"
                  showStrength={false}
                  showRequirements={false}
                />
              </div>
            </div>
          </div>

          <div className="login-page-options">
            <label className="login-page-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              Lembrar de mim
            </label>
            <Link to="/forgot-password" className="login-page-forgot">
              Esqueci minha senha
            </Link>
          </div>

          {passwordResetNotice && (
            <div
              className="success-message"
              style={{
                marginTop: '14px',
                textAlign: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#065f46',
                fontSize: '14px',
              }}
            >
              Senha atualizada. Faça login com a nova senha.
            </div>
          )}

          {error && (
            <div
              className="error-message"
              style={{ marginTop: '14px', textAlign: 'center' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-page-submit"
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
            {!loading && <ArrowRight size={20} aria-hidden />}
          </button>
        </form>

        <p className="login-page-footer">
          Ainda não tem uma conta?{' '}
          <Link to="/clinic-signup">Criar conta →</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
