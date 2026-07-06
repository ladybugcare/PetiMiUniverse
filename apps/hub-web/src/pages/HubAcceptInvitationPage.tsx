import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';
import { hubInvitationsApi } from '../services/hubInvitationsApi';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubAcceptInvitationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof hubInvitationsApi.preview>> | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Link de convite inválido.');
      setLoading(false);
      return;
    }
    setLoading(true);
    void hubInvitationsApi
      .preview(token)
      .then((p) => {
        setPreview(p);
        if (p.blocked || p.account_exists) {
          setError(
            'Este e-mail já possui conta no sistema. No MVP, convites são apenas para novos usuários — use um e-mail que ainda não tenha cadastro.',
          );
        }
      })
      .catch((e: unknown) => {
        setError((e as Error)?.message || 'Convite inválido ou expirado.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="hub-login-page-root">
        <div className="hub-login-page-card">
          <p className="hub-login-page-subwelcome" style={{ marginBottom: 0 }}>
            Carregando convite…
          </p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
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
          <h1 className="hub-login-page-welcome">Convite indisponível</h1>
          <p className="hub-login-page-msg hub-login-page-msg--error">{error || 'Não foi possível carregar o convite.'}</p>
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

      <div className="hub-login-page-card">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
            <span className="hub-login-page-tagline">CONVITE DA EQUIPE</span>
          </div>
        </div>

        <h1 className="hub-login-page-welcome">Convite para a equipe</h1>
        <p className="hub-login-page-subwelcome">
          Você foi convidado(a) para <strong>{preview.clinic_name || 'a clínica'}</strong>
          {preview.unit_name ? (
            <>
              {' '}
              — unidade <strong>{preview.unit_name}</strong>
            </>
          ) : null}{' '}
          como <strong>{preview.role_label}</strong>.
        </p>

        <div className="hub-login-page-field-block">
          <span className="hub-login-page-label">E-mail do convite</span>
          <div className="hub-login-page-field-row hub-login-page-field-row--readonly">
            <span className="hub-login-page-field-icon" aria-hidden>
              <Mail size={20} color="#c86a4d" />
            </span>
            <input
              type="email"
              className="hub-login-page-text-input"
              value={preview.invitation.email}
              readOnly
              tabIndex={-1}
              aria-readonly
            />
          </div>
        </div>

        <button
          type="button"
          className="hub-login-page-submit"
          onClick={() => navigate(`/signup-convite?token=${encodeURIComponent(token)}`)}
        >
          Criar minha conta
          <ArrowRight size={20} aria-hidden />
        </button>

        <p className="hub-login-page-footer">
          Já tem conta? <Link to="/login">Fazer login</Link>
        </p>
      </div>
    </div>
  );
};

export default HubAcceptInvitationPage;
