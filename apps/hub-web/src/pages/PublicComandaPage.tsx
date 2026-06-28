import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getApiBaseUrl } from '@petimi/web-core';
import { HubComandaPublicView, type HubPublicComandaResponse } from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';

const PublicComandaPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<HubPublicComandaResponse | null>(null);
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
    void fetch(`${getApiBaseUrl()}/api/public/comandas/${encodeURIComponent(t)}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as HubPublicComandaResponse & { error?: string };
        if (!r.ok) throw new Error(data.error || 'Não foi possível carregar a comanda');
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setPayload(data);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setPayload(null);
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
          <p className="hub-public-quote__state-text">Um momento enquanto obtemos a comanda.</p>
        </div>
      </div>
    );
  }

  if (err || !payload) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível mostrar a comanda</p>
          <p className="hub-public-quote__state-text">{err || 'Comanda não encontrada ou link inválido.'}</p>
        </div>
      </div>
    );
  }

  return <HubComandaPublicView payload={payload} />;
};

export default PublicComandaPage;
