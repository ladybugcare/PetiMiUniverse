import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getApiBaseUrl } from '@petimi/web-core';
import { BoardingCarePublicView, type BoardingCarePublicData, type BoardingCarePublicSubmit } from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';

const PublicBoardingCarePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<BoardingCarePublicData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const t = token?.trim() ?? '';
  const url = `${getApiBaseUrl()}/api/public/boarding-care/${encodeURIComponent(t)}`;

  useEffect(() => {
    if (!t) {
      setErr('Link inválido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(url)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as BoardingCarePublicData & { error?: string };
        if (!r.ok) throw new Error(body.error || 'Não foi possível carregar a ficha');
        return body;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, url]);

  const submit = async (payload: BoardingCarePublicSubmit) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(body.error || 'Não foi possível enviar agora. Tente novamente.');
  };

  if (loading) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="status">
          <p className="hub-public-quote__state-title">Carregando…</p>
          <p className="hub-public-quote__state-text">Um momento enquanto buscamos a ficha do seu pet.</p>
        </div>
      </div>
    );
  }
  if (err || !data) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível abrir a ficha</p>
          <p className="hub-public-quote__state-text">{err || 'Link não encontrado ou inválido.'}</p>
        </div>
      </div>
    );
  }

  return <BoardingCarePublicView data={data} onSubmit={submit} />;
};

export default PublicBoardingCarePage;
