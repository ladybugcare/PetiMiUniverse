import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  entitlementBlockedMessage,
  useHubEntitlements,
} from '../hooks/useHubEntitlements';

type Props = {
  children: React.ReactNode;
};

/** Bloqueia deep-links de módulos/áreas fora do plano (além da ocultação no menu). */
const HubEntitlementGuard: React.FC<Props> = ({ children }) => {
  const { pathname } = useLocation();
  const { pathAllowed, subscription } = useHubEntitlements();

  if (!subscription) {
    return <>{children}</>;
  }

  if (pathAllowed(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="hub-clientes" style={{ padding: '32px 24px', maxWidth: 520 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 8px', fontWeight: 650 }}>
        Recurso indisponível no seu plano
      </h1>
      <p style={{ margin: '0 0 20px', color: 'var(--hub-muted, #5c6570)', lineHeight: 1.5 }}>
        {entitlementBlockedMessage('path')}
      </p>
      <Link to="/hub/assinatura" className="hub-landing-btn hub-landing-btn--primary">
        Ver planos e fazer upgrade
      </Link>
    </div>
  );
};

export default HubEntitlementGuard;
