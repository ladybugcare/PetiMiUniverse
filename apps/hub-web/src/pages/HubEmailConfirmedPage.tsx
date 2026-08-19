import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { getSupabase, useAuth } from '@petimi/web-core';
import { getHubPostLoginDestination } from '../authNavigation';
import { applyHubSessionContext, hubSessionApi } from '../services/hubSessionApi';
import './hub-onboarding-page.css';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const markSrc = `${baseUrl}hub-mark.svg`;

const HubEmailConfirmedPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthFromLogin } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirmando o seu e-mail…');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = getSupabase();
      try {
        const hash = window.location.hash?.replace(/^#/, '') || '';
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          if (!cancelled && data.session) {
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
              user: data.user,
              session: data.session,
              clinicUser,
              onboarding,
            });
            setStatus('success');
            setMessage('E-mail confirmado! Redirecionando…');
            const dest = getHubPostLoginDestination({ onboarding, clinicUser, user: data.user }, undefined);
            setTimeout(() => {
              if (!cancelled && dest.type === 'internal') navigate(dest.path, { replace: true });
            }, 1200);
            return;
          }
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          if (!cancelled) {
            setStatus('success');
            setMessage('Sessão ativa. Pode continuar o cadastro.');
          }
          return;
        }

        if (!cancelled) {
          setStatus('success');
          setMessage('E-mail confirmado. Inicie sessão para continuar.');
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus('error');
          setMessage((e as Error)?.message || 'Não foi possível confirmar o e-mail.');
        }
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
