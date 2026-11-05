import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { hubSubscriptionApi } from '../services/hubSubscriptionApi';

/** Lembra o administrador de concluir a mensalidade, sem bloquear a operação. */
const HubSubscriptionBanner: React.FC = () => {
  const { pathname } = useLocation();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hubSubscriptionApi
      .me()
      .then((me) => {
        if (!cancelled) setPending(me.subscription?.status === 'pending_payment');
      })
      .catch(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!pending || pathname.startsWith('/hub/assinatura')) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        margin: '0 0 12px',
        padding: '10px 14px',
        borderRadius: 10,
        background: '#fff4e8',
        color: '#6a3b22',
        fontSize: 14,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <CreditCard size={16} aria-hidden />
        A mensalidade do PetMi Hub ainda não foi autorizada no Mercado Pago.
      </span>
      <Link to="/hub/assinatura" style={{ color: '#c86a4d', fontWeight: 650 }}>
        Ver plano
      </Link>
    </div>
  );
};

export default HubSubscriptionBanner;
