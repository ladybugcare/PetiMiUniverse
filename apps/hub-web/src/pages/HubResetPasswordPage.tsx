import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { getSupabase } from '@petimi/web-core';
import { passwordUpdateErrorMessage } from '../utils/passwordUpdateError';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub.svg`;

const HubResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    const run = async () => {
      try {
        let { data, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;

        if (
          !data.session &&
          typeof window !== 'undefined' &&
          window.location.hash.includes('type=recovery')
        ) {
          await new Promise((r) => setTimeout(r, 450));
          if (!cancelled) {
            const retry = await supabase.auth.getSession();
            data = retry.data;
            sessionError = retry.error;
          }
        }

        if (cancelled) return;
        if (sessionError) {
          setError(sessionError.message);
          setHasSession(false);
          return;
        }
        setHasSession(Boolean(data.session));
        if (!data.session) {
          setError(
            'Link inválido ou expirado. Solicite um novo e-mail em Esqueci minha senha.',
          );
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError((e as Error)?.message || 'Não foi possível validar o link.');
          setHasSession(false);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void run();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setHasSession(true);
        setError(null);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(passwordUpdateErrorMessage(updateError));
        return;
      }
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erro ao atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hub-login-page-root">
      <Link to="/" className="hub-login-page-back">
        ← Início
      </Link>

      <div className="hub-login-page-card">
        <div className="hub-login-page-logo-row hub-login-page-logo-row--wordmark">
          <img
            src={logoSrc}
            alt="PetMi Hub"
            className="hub-login-page-logo-img hub-login-page-logo-img--wordmark"
            width={206}
            height={48}
          />
        </div>

        {checking ? (
          <p className="hub-login-page-subwelcome" style={{ textAlign: 'center' }}>
            Validando o link de recuperação…
          </p>
        ) : !hasSession ? (
          <>
            <h1 className="hub-login-page-welcome">Link inválido</h1>
            <p className="hub-login-page-subwelcome">{error}</p>
            <Link to="/forgot-password" className="hub-login-page-submit" style={{ display: 'inline-flex' }}>
              Pedir novo link
              <ArrowRight size={20} aria-hidden />
            </Link>
            <p className="hub-login-page-footer">
              <Link to="/login">← Voltar ao login</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="hub-login-page-welcome">Nova senha</h1>
            <p className="hub-login-page-subwelcome">Escolha uma senha forte para a sua conta Hub.</p>

            <form onSubmit={handleSubmit}>
              <div className="hub-login-page-field-block hub-login-page-field-block--tight">
                <label htmlFor="hub-reset-password" className="hub-login-page-label">
                  Nova senha
                </label>
                <div className="hub-login-page-field-row">
                  <span className="hub-login-page-field-icon" aria-hidden>
                    <Lock size={20} color="#c86a4d" strokeWidth={2} />
                  </span>
                  <div className="hub-login-page-password-wrap">
                    <input
                      id="hub-reset-password"
                      type={showPassword ? 'text' : 'password'}
                      className="hub-login-page-password-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      minLength={8}
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

              <div className="hub-login-page-field-block">
                <label htmlFor="hub-reset-confirm" className="hub-login-page-label">
                  Confirmar senha
                </label>
                <div className="hub-login-page-field-row">
                  <span className="hub-login-page-field-icon" aria-hidden>
                    <Lock size={20} color="#c86a4d" strokeWidth={2} />
                  </span>
                  <input
                    id="hub-reset-confirm"
                    type={showPassword ? 'text' : 'password'}
                    className="hub-login-page-text-input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              {error && <div className="hub-login-page-msg hub-login-page-msg--error">{error}</div>}

              <button type="submit" className="hub-login-page-submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
                {!loading && <ArrowRight size={20} aria-hidden />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default HubResetPasswordPage;
