import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getApiBaseUrl } from '@petimi/web-core';
import { HubQuotePublicView, type HubQuote } from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';

const PublicQuotePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<HubQuote | null>(null);
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
    void fetch(`${getApiBaseUrl()}/api/public/quotes/${encodeURIComponent(t)}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { quote?: HubQuote; error?: string };
        if (!r.ok) throw new Error(data.error || 'Não foi possível carregar o orçamento');
        return data.quote ?? null;
      })
      .then((q) => {
        if (!cancelled) {
          setQuote(q);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setQuote(null);
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
          <p className="hub-public-quote__state-title">A carregar…</p>
          <p className="hub-public-quote__state-text">Um momento enquanto obtemos o seu orçamento.</p>
        </div>
      </div>
    );
  }
  if (err || !quote) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível mostrar o orçamento</p>
          <p className="hub-public-quote__state-text">{err || 'Orçamento não encontrado ou link inválido.'}</p>
        </div>
      </div>
    );
  }

  return <HubQuotePublicView quote={quote} />;
};

export default PublicQuotePage;
