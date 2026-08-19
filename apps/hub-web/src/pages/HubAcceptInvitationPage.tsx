import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ArrowRight } from 'lucide-react';
import { getSupabase, useAuth } from '@petimi/web-core';
import { hubInvitationsApi } from '../services/hubInvitationsApi';
import { getHubPostLoginDestination } from '../authNavigation';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

function loginHrefForInvite(token: string): string {
  const redirect = `/accept-invitation?token=${encodeURIComponent(token)}`;
  return `/login?redirect=${encodeURIComponent(redirect)}`;
}

const HubAcceptInvitationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthFromLogin, user } = useAuth();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof hubInvitationsApi.preview>> | null>(
    null,
  );

  const acceptWhileLoggedIn = async (inviteToken: string) => {
    setAccepting(true);
    setError(null);
    try {
      const res = await hubInvitationsApi.accept(inviteToken);
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      try {
        const ctx = await hubSessionApi.getContext();
        applyHubSessionContext(ctx);
        await setAuthFromLogin({
          user: sessionData.session?.user ?? user,
          session: sessionData.session,
          clinicUser: ctx.clinicUser,
          onboarding: ctx.onboarding,
        });
        const dest = getHubPostLoginDestination(
          {
            clinicUser: ctx.clinicUser,
            onboarding: ctx.onboarding,
            user: sessionData.session?.user ?? user,
          },
          undefined,
        );
        if (dest.type === 'internal') {
          navigate(dest.path, { replace: true });
          return;
        }
      } catch {
        /* fallback abaixo */
      }
      const dest = getHubPostLoginDestination(
        {
          clinicUser: res.clinic_user,
          onboarding: { shouldCompleteClinicProfile: false, needsOnboarding: false },
          user: sessionData.session?.user ?? user,
        },
        undefined,
      );
      if (dest.type === 'internal') navigate(dest.path, { replace: true });
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Não foi possível aceitar o convite.');
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Link de convite inválido.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void hubInvitationsApi
      .preview(token)
      .then(async (p) => {
        if (cancelled) return;
        setPreview(p);
        if (p.blocked) {
          setError('Este convite não está disponível.');
          return;
        }

        try {
          const supabase = getSupabase();
          const { data: sessionData } = await supabase.auth.getSession();
          const sessionEmail = sessionData.session?.user?.email?.trim().toLowerCase() || '';
          const inviteEmail = p.invitation.email.trim().toLowerCase();
          if (sessionData.session && sessionEmail && sessionEmail === inviteEmail) {
            setLoading(false);
            await acceptWhileLoggedIn(token);
            return;
          }
        } catch {
          /* segue para UI de preview */
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError((e as Error)?.message || 'Convite inválido ou expirado.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao montar / token
  }, [token]);

  if (loading || accepting) {
    return (
      <div className="hub-login-page-root">
        <div className="hub-login-page-card">
          <p className="hub-login-page-subwelcome" style={{ marginBottom: 0 }}>
            {accepting ? 'Aceitando convite…' : 'Carregando convite…'}
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
          <p className="hub-login-page-msg hub-login-page-msg--error">
            {error || 'Não foi possível carregar o convite.'}
          </p>
          <Link to="/login" className="hub-login-page-submit" style={{ marginTop: 24, textDecoration: 'none' }}>
            Ir para o login
            <ArrowRight size={20} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  const accountExists = preview.account_exists;

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

        {accountExists ? (
          <>
            <p className="hub-login-page-subwelcome" style={{ marginTop: 8 }}>
              Este e-mail já possui conta. Entre para aceitar o convite e vincular-se à clínica.
            </p>
            <Link
              to={loginHrefForInvite(token)}
              className="hub-login-page-submit"
              style={{ textDecoration: 'none' }}
            >
              Entrar e aceitar convite
              <ArrowRight size={20} aria-hidden />
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="hub-login-page-submit"
            onClick={() => navigate(`/signup-convite?token=${encodeURIComponent(token)}`)}
          >
            Criar minha conta
            <ArrowRight size={20} aria-hidden />
          </button>
        )}

        <p className="hub-login-page-footer">
          {accountExists ? (
            <>
              Ainda não tem conta neste e-mail?{' '}
              <Link to={`/signup-convite?token=${encodeURIComponent(token)}`}>Criar conta</Link>
            </>
          ) : (
            <>
              Já tem conta? <Link to={loginHrefForInvite(token)}>Fazer login</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

export default HubAcceptInvitationPage;
