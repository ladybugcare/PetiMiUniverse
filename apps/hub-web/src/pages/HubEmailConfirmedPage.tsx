import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, useAuth } from '@petimi/web-core';
import { getHubPostLoginDestination } from '../authNavigation';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';
import './hub-onboarding-page.css';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

type ConfirmStatus = 'loading' | 'success' | 'error';

async function finishWithSession(
  session: Session,
  user: User | null,
  setAuthFromLogin: ReturnType<typeof useAuth>['setAuthFromLogin'],
): Promise<{ onboarding: Record<string, unknown>; clinicUser: Record<string, unknown> | null }> {
  let clinicUser: Record<string, unknown> | null = null;
  let onboarding: Record<string, unknown> = {
    shouldCompleteClinicProfile: false,
    needsOnboarding: false,
  };

  try {
    const ctx = await hubSessionApi.getContext();
    applyHubSessionContext(ctx);
    clinicUser = ctx.clinicUser as Record<string, unknown> | null;
    onboarding = ctx.onboarding as Record<string, unknown>;
  } catch {
    /* sessão Auth ok; contexto Hub pode falhar — não forçar onboarding de clínica */
  }

  await setAuthFromLogin({
    user: user ?? session.user,
    session,
    clinicUser,
    onboarding,
  });

  return { onboarding, clinicUser };
}

const HubEmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthFromLogin } = useAuth();
  const [status, setStatus] = useState<ConfirmStatus>('loading');
  const [message, setMessage] = useState('Confirmando o seu e-mail…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = getSupabase();
      const url = new URL(window.location.href);
      const hash = window.location.hash?.replace(/^#/, '') || '';
      const hashParams = new URLSearchParams(hash);
      const search = url.searchParams;

      const markSuccess = async (session: Session, nextMessage: string) => {
        if (cancelled) return;
        const { onboarding, clinicUser } = await finishWithSession(
          session,
          session.user,
          setAuthFromLogin,
        );
        if (cancelled) return;
        setStatus('success');
        setMessage(nextMessage);
        window.history.replaceState({}, document.title, url.origin + url.pathname);
        const dest = getHubPostLoginDestination(
          { onboarding, clinicUser, user: session.user },
          undefined,
        );
        setTimeout(() => {
          if (!cancelled && dest.type === 'internal') navigate(dest.path, { replace: true });
        }, 1200);
      };

      const markError = (msg: string) => {
        if (cancelled) return;
        setStatus('error');
        setMessage(msg);
      };

      try {
        const hashError = hashParams.get('error') || search.get('error');
        if (hashError) {
          const desc =
            hashParams.get('error_description') ||
            search.get('error_description') ||
            hashError;
          const decoded = decodeURIComponent(desc.replace(/\+/g, ' '));
          markError(
            decoded.includes('expired') || decoded.includes('otp_expired')
              ? 'Este link de confirmação expirou ou já foi usado. Peça um novo e-mail de confirmação no login.'
              : decoded,
          );
          return;
        }

        // 1) PKCE: ?code=...
        const code = search.get('code');
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data.session) {
            await markSuccess(data.session, 'E-mail confirmado! Redirecionando…');
            return;
          }
          throw new Error('Não foi possível confirmar o e-mail com este link.');
        }

        // 2) token_hash / token na query (template Confirm signup)
        const tokenHash = search.get('token_hash') || search.get('token');
        const otpType = (search.get('type') || 'signup') as
          | 'signup'
          | 'email'
          | 'magiclink'
          | 'invite';
        if (tokenHash && (otpType === 'signup' || otpType === 'email' || otpType === 'magiclink' || otpType === 'invite')) {
          const email = search.get('email') || undefined;
          const { data, error } = email
            ? await supabase.auth.verifyOtp({
                email,
                token_hash: tokenHash,
                type: otpType === 'invite' ? 'invite' : otpType === 'magiclink' ? 'magiclink' : 'signup',
              })
            : await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: otpType === 'signup' ? 'signup' : 'email',
              });
          if (error) throw error;
          if (data.session) {
            await markSuccess(data.session, 'E-mail confirmado! Redirecionando…');
            return;
          }
          throw new Error('Não foi possível confirmar o e-mail com este link.');
        }

        // 3) Implicit: #access_token=&refresh_token=
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (data.session) {
            await markSuccess(data.session, 'E-mail confirmado! Redirecionando…');
            return;
          }
          throw new Error('Não foi possível confirmar o e-mail com este link.');
        }

        // 4) Sessão já ativa (ex.: detectSessionInUrl processou antes)
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user?.email_confirmed_at || sessionData.session?.user) {
          const confirmed = Boolean(sessionData.session.user.email_confirmed_at);
          if (confirmed) {
            await markSuccess(sessionData.session, 'E-mail já confirmado. Redirecionando…');
            return;
          }
        }

        markError(
          'Não encontramos um link de confirmação válido nesta página. Abra o link mais recente do e-mail ou reenvie a confirmação no login.',
        );
      } catch (e: unknown) {
        markError((e as Error)?.message || 'Não foi possível confirmar o e-mail.');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, setAuthFromLogin]);

  return (
    <div className="hub-login-page-root">
      <div className="hub-login-page-card">
        <div className="hub-login-page-logo-row">
          <img src={markSrc} alt="" className="hub-login-page-logo-img" width={48} height={48} />
          <div className="hub-login-page-brand-block">
            <span className="hub-login-page-brand-name">PetMi Hub</span>
          </div>
        </div>
        {status === 'loading' && <p className="hub-login-page-subwelcome">{message}</p>}
        {status === 'success' && (
          <>
            <CheckCircle2 className="hub-onboarding-success-icon" size={56} />
            <p className="hub-login-page-subwelcome" style={{ textAlign: 'center' }}>
              {message}
            </p>
            <Link to="/login" className="hub-login-page-submit" style={{ marginTop: 20, textDecoration: 'none' }}>
              Ir para o login
              <ArrowRight size={20} aria-hidden />
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="hub-onboarding-success-icon" size={56} style={{ color: '#b91c1c' }} />
            <p className="hub-login-page-msg hub-login-page-msg--error">{message}</p>
            <Link to="/login" className="hub-login-page-submit" style={{ marginTop: 16, textDecoration: 'none' }}>
              Voltar ao login
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default HubEmailConfirmedPage;
