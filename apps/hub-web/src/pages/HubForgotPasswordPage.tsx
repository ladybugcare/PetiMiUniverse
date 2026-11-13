import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';
import { getSupabase } from '@petimi/web-core';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const logoSrc = `${baseUrl}petmi-hub.svg`;

const HubForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Informe seu e-mail.');
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (resetError) throw resetError;
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        typeof (err as Error)?.message === 'string'
          ? (err as Error).message
          : 'Não foi possível enviar o e-mail de recuperação.';
      setError(msg);
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

        {success ? (
          <>
            <h1 className="hub-login-page-welcome">E-mail enviado</h1>
            <p className="hub-login-page-subwelcome">
              Se existir uma conta com esse e-mail, você receberá um link para redefinir a senha.
              Verifique também a pasta de spam.
            </p>
            <Link to="/login" className="hub-login-page-submit" style={{ display: 'inline-flex' }}>
              Voltar ao login
              <ArrowRight size={20} aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <h1 className="hub-login-page-welcome">Esqueceu a senha?</h1>
            <p className="hub-login-page-subwelcome">
              Digite o e-mail da sua conta Hub. Enviaremos um link para criar uma nova senha.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="hub-login-page-field-block">
                <label htmlFor="hub-forgot-email" className="hub-login-page-label">
                  Email
                </label>
                <div className="hub-login-page-field-row">
                  <span className="hub-login-page-field-icon" aria-hidden>
                    <Mail size={20} color="#c86a4d" strokeWidth={2} />
                  </span>
                  <input
                    id="hub-forgot-email"
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

              {error && <div className="hub-login-page-msg hub-login-page-msg--error">{error}</div>}

              <button type="submit" className="hub-login-page-submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                {!loading && <ArrowRight size={20} aria-hidden />}
              </button>
            </form>

            <p className="hub-login-page-footer">
              <Link to="/login">← Voltar ao login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default HubForgotPasswordPage;
