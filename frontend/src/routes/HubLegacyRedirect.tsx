import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getHubWebBaseUrl } from '../utils/hubWebUrl';

/**
 * Rotas `/hub/*` no app Vet: com `REACT_APP_HUB_WEB_URL`, redireciona para a app Hub dedicada.
 * Sem essa variável, mostra instruções (evita carregar duas stacks de auth diferentes no mesmo bundle).
 */
const HubLegacyRedirect: React.FC = () => {
  const base = getHubWebBaseUrl();
  const { pathname } = useLocation();

  useEffect(() => {
    if (base) {
      window.location.replace(`${base.replace(/\/$/, '')}${pathname}`);
    }
  }, [base, pathname]);

  if (base) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        A redirecionar para o PetMi Hub…
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 520, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.25rem' }}>PetMi Hub noutra app</h1>
      <p style={{ color: '#555', lineHeight: 1.6 }}>
        O Hub corre na app web dedicada (porta 3002 em desenvolvimento). Para os links do menu
        redirecionarem automaticamente, defina no <code>frontend/.env.local</code>:
      </p>
      <pre
        style={{
          background: '#f4f4f5',
          padding: 12,
          borderRadius: 8,
          fontSize: 13,
          overflow: 'auto',
        }}
      >
        {`REACT_APP_HUB_WEB_URL=http://localhost:3002`}
      </pre>
      <p style={{ color: '#555' }}>
        Ou abra directamente:{' '}
        <a href={`http://localhost:3002${pathname}`}>http://localhost:3002{pathname}</a>
      </p>
    </div>
  );
};

export default HubLegacyRedirect;
