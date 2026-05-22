import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { supabase } from '../services/supabase';
import PasswordInput from '../components/PasswordInput';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const readSession = () => supabase.auth.getSession();

      try {
        let { data, error: sessionError } = await readSession();
        if (cancelled) return;

        if (
          !data.session &&
          typeof window !== 'undefined' &&
          window.location.hash.includes('type=recovery')
        ) {
          await new Promise((r) => setTimeout(r, 450));
          if (!cancelled) {
            const retry = await readSession();
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
        setHasSession(!!data.session);
        if (!data.session) {
          setError(
            'Link inválido ou expirado. Peça um novo email de recuperação em Esqueci minha senha.'
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Não foi possível validar o link.');
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

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      await supabase.auth.signOut();
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="login-page-root">
        <div className="login-page-card" style={{ maxWidth: 440, margin: '80px auto' }}>
          <p className="login-page-subwelcome" style={{ textAlign: 'center' }}>
            A validar o link de recuperação...
          </p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="login-page-root">
        <Link to="/" className="login-page-back">
          ← Início
        </Link>
        <div className="login-page-card" style={{ maxWidth: 440, margin: '80px auto' }}>
          <h1 className="login-page-welcome" style={{ fontSize: '1.35rem' }}>
            Não foi possível redefinir a senha
          </h1>
          <p className="login-page-subwelcome">{error}</p>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/forgot-password" className="btn btn-primary" style={{ textAlign: 'center' }}>
              Pedir novo link
            </Link>
            <Link to="/login" className="login-page-forgot" style={{ textAlign: 'center' }}>
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-root">
      <Link to="/login" className="login-page-back">
        ← Login
      </Link>

      <div className="login-page-card">
        <h1 className="login-page-welcome">Nova senha</h1>
        <p className="login-page-subwelcome">Defina uma nova senha para a sua conta.</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="reset-password" className="login-page-label">
              Nova senha
            </label>
            <div className="login-page-field-row">
              <span className="login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c46c6a" strokeWidth={2} />
              </span>
              <div className="login-page-password-slot" style={{ flex: 1 }}>
                <PasswordInput
                  id="reset-password"
                  value={password}
                  onChange={(value) => setPassword(value)}
                  placeholder="Nova senha"
                  required
                  autoComplete="new-password"
                  showStrength
                  showRequirements
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="reset-password-confirm" className="login-page-label">
              Confirmar senha
            </label>
            <div className="login-page-field-row">
              <span className="login-page-field-icon" aria-hidden>
                <Lock size={20} color="#c46c6a" strokeWidth={2} />
              </span>
              <div className="login-page-password-slot" style={{ flex: 1 }}>
                <PasswordInput
                  id="reset-password-confirm"
                  value={confirm}
                  onChange={(value) => setConfirm(value)}
                  placeholder="Repita a nova senha"
                  required
                  autoComplete="new-password"
                  showStrength={false}
                  showRequirements={false}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="error-message" style={{ marginTop: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button type="submit" className="login-page-submit" disabled={loading}>
            {loading ? 'A guardar...' : 'Guardar nova senha'}
            {!loading && <ArrowRight size={20} aria-hidden />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
