import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HubClinicPublicLanding, type HubClinicPublicLandingData } from '@petimi/hub-ui';
import { fetchPublicClinicProfile } from '../services/hubClinicPublicProfileApi';
import '../../../../packages/hub-ui/src/pages/public-profile/clinic-public-profile.css';

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const brandLogoSrc = `${baseUrl}petmi-hub.svg`;
const brandLogoOnDarkSrc = `${baseUrl}petmi-hub-on-dark.svg`;

const PublicClinicProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<HubClinicPublicLandingData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = slug?.trim().toLowerCase();
    if (!s) {
      setErr('Link inválido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPublicClinicProfile(s)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setErr(null);
        const title = payload.profile.seo_title || payload.profile.clinic_name;
        document.title = title;
        const desc = payload.profile.seo_description || payload.profile.headline || '';
        let meta = document.querySelector('meta[name="description"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'description');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', desc);
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
          ogTitle = document.createElement('meta');
          ogTitle.setAttribute('property', 'og:title');
          document.head.appendChild(ogTitle);
        }
        ogTitle.setAttribute('content', title);
        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (!ogDesc) {
          ogDesc = document.createElement('meta');
          ogDesc.setAttribute('property', 'og:description');
          document.head.appendChild(ogDesc);
        }
        ogDesc.setAttribute('content', desc);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Página não encontrada');
          setData(null);
          document.title = 'Página não encontrada · PetMi Hub';
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="hub-cpp">
        <div className="hub-cpp__state hub-cpp__state--loading" role="status" aria-live="polite">
          <img
            className="hub-cpp__state-logo"
            src={brandLogoSrc}
            alt=""
            width={168}
            height={40}
          />
          <p className="hub-cpp__state-title">Carregando…</p>
          <p className="hub-cpp__state-text">Buscando a página da clínica.</p>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="hub-cpp">
        <div className="hub-cpp__state" role="alert">
          <p className="hub-cpp__state-title">Página não encontrada</p>
          <p className="hub-cpp__state-text">
            {err || 'Esta clínica ainda não publicou um perfil público.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <HubClinicPublicLanding
      data={data}
      brandLogoSrc={brandLogoSrc}
      brandLogoOnDarkSrc={brandLogoOnDarkSrc}
    />
  );
};

export default PublicClinicProfilePage;
