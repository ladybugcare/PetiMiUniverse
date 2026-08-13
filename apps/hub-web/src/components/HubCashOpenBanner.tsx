import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { useHubCashSession } from '../contexts/HubCashSessionContext';

/**
 * Banner persistente que aparece em qualquer tela (exceto /hub/caixa*)
 * quando o caixa está aberto de um dia anterior OU há itens sem cobrança.
 */
const HubCashOpenBanner: React.FC = () => {
  const { isOpen, isPreviousDay, pendingBillingCount, openedAt } = useHubCashSession();
  const { pathname } = useLocation();

  const showBanner =
    isOpen && (isPreviousDay || pendingBillingCount > 0) && !pathname.startsWith('/hub/caixa');

  if (!showBanner) return null;

  const openedAtLabel = openedAt
    ? new Date(openedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        marginBottom: 16,
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        fontSize: 13,
        color: '#92400e',
        flexWrap: 'wrap',
      }}
    >
      <Wallet size={16} style={{ flexShrink: 0 }} aria-hidden />
      <span>
        <strong>Caixa aberto{openedAtLabel ? ` desde ${openedAtLabel}` : ''}</strong>
        {pendingBillingCount > 0 && ` — ${pendingBillingCount} item(ns) sem cobrança`}
        {isPreviousDay && ' — sessão de dia anterior'}
      </span>
      <Link
        to="/hub/caixa"
        style={{
          marginLeft: 'auto',
          color: '#b45309',
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Ir ao Caixa →
      </Link>
    </div>
  );
};

export default HubCashOpenBanner;
