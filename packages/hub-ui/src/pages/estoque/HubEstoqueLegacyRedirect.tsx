import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

type HubEstoqueLegacyRedirectProps = {
  to: string;
  defaults?: Record<string, string>;
};

/** Preserva query string ao redirecionar rotas antigas de estoque. */
const HubEstoqueLegacyRedirect: React.FC<HubEstoqueLegacyRedirectProps> = ({ to, defaults }) => {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (defaults) {
    for (const [key, value] of Object.entries(defaults)) {
      if (!next.get(key)) next.set(key, value);
    }
  }
  const qs = next.toString();
  return <Navigate to={qs ? `${to}?${qs}` : to} replace />;
};

export default HubEstoqueLegacyRedirect;
