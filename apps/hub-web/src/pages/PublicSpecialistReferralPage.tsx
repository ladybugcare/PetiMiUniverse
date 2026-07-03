import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HubSpecialistReferralPublicView, fetchPublicSpecialistReferralByToken } from '@petimi/hub-ui';
import type { HubPublicSpecialistReferralPayload } from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const PublicSpecialistReferralPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [referral, setReferral] = useState<HubPublicSpecialistReferralPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = token?.trim();
    if (!t) {
      setErr('Link inválido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPublicSpecialistReferralByToken(t)
      .then((payload) => {
        if (!cancelled) {
          setReferral(payload);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setReferral(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="status">
          <p className="hub-public-quote__state-title">Carregando…</p>
        </div>
      </div>
    );
  }

  if (err || !referral) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível mostrar o encaminhamento</p>
          <p className="hub-public-quote__state-text">{err || 'Link inválido.'}</p>
        </div>
      </div>
    );
  }

  return <HubSpecialistReferralPublicView referral={referral} publicToken={token?.trim()} />;
};

export default PublicSpecialistReferralPage;
