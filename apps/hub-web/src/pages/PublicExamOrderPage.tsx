import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HubExamOrderPublicView, fetchPublicExamOrderByToken } from '@petimi/hub-ui';
import type { HubPublicExamOrderPayload } from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const PublicExamOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [examOrder, setExamOrder] = useState<HubPublicExamOrderPayload | null>(null);
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
    void fetchPublicExamOrderByToken(t)
      .then((payload) => {
        if (!cancelled) {
          setExamOrder(payload);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setExamOrder(null);
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

  if (err || !examOrder) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível mostrar a solicitação</p>
          <p className="hub-public-quote__state-text">{err || 'Link inválido.'}</p>
        </div>
      </div>
    );
  }

  return <HubExamOrderPublicView examOrder={examOrder} publicToken={token?.trim()} />;
};

export default PublicExamOrderPage;
