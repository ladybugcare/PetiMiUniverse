import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  HubPrescriptionPublicView,
  fetchPublicPrescriptionByToken,
  type HubPublicPrescriptionPayload,
} from '@petimi/hub-ui';
import '../../../../packages/hub-ui/src/pages/orcamentos/orcamentos-page.css';
import '../../../../packages/hub-ui/src/pages/clinica/clinica-page.css';

const PublicPrescriptionPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [prescription, setPrescription] = useState<HubPublicPrescriptionPayload | null>(null);
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
    void fetchPublicPrescriptionByToken(t)
      .then((payload) => {
        if (!cancelled) {
          setPrescription(payload);
          setErr(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr((e as Error)?.message || 'Erro');
          setPrescription(null);
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
          <p className="hub-public-quote__state-text">Um momento enquanto validamos a receita.</p>
        </div>
      </div>
    );
  }

  if (err || !prescription) {
    return (
      <div className="hub-public-quote">
        <div className="hub-public-quote__state" role="alert">
          <p className="hub-public-quote__state-title">Não foi possível mostrar a receita</p>
          <p className="hub-public-quote__state-text">{err || 'Receita não encontrada ou link inválido.'}</p>
        </div>
      </div>
    );
  }

  return <HubPrescriptionPublicView prescription={prescription} publicToken={token?.trim()} />;
};

export default PublicPrescriptionPage;
