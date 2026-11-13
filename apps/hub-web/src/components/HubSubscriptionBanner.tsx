import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { useHubEntitlements } from '../hooks/useHubEntitlements';

/** Avisos de assinatura (pagamento, soft-lock, limites) — não substitui o enforce do backend. */
const HubSubscriptionBanner: React.FC = () => {
  const { pathname } = useLocation();
  const { subscription, accessMode, limitsExceeded } = useHubEntitlements();

  if (!subscription || pathname.startsWith('/hub/assinatura')) return null;

  const status = subscription.status;
  let message: string | null = null;

  if (status === 'pending_payment') {
    message = 'A mensalidade do PetMi Hub ainda não foi autorizada no Mercado Pago.';
  } else if (status === 'past_due') {
    message =
      accessMode === 'read_history'
        ? 'Assinatura em atraso: o acesso está limitado à consulta de históricos. Regularize o pagamento.'
        : 'Assinatura em atraso. Regularize o pagamento para evitar restrições na operação.';
  } else if (status === 'canceled') {
    message = 'Assinatura cancelada. Reative o plano para voltar a operar normalmente.';
  } else if (limitsExceeded) {
    message =
      'Sua clínica está acima dos limites do plano. Não é possível criar novas unidades ou convidar usuários até o upgrade.';
  }

  if (!message) return null;

  return (
    <div className="hub-subscription-banner" role="status">
      <span className="hub-subscription-banner__text">
        <CreditCard size={16} aria-hidden />
        {message}
      </span>
      <Link to="/hub/assinatura" className="hub-subscription-banner__link">
        Ver plano
      </Link>
    </div>
  );
};

export default HubSubscriptionBanner;
