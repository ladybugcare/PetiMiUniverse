import React from 'react';
import { usePermissions } from '@petimi/web-core';
import { HubTabs } from '../../components/HubTabs';
import { isPickupDriverOnly } from './pickupAccess';

function isMinhaRotaPath(pathname: string): boolean {
  return (
    pathname === '/hub/leva-e-traz/minha-rota' || pathname.startsWith('/hub/leva-e-traz/minha-rota/')
  );
}

function isRotasDoDiaPath(pathname: string): boolean {
  if (!pathname.startsWith('/hub/leva-e-traz')) return false;
  if (isMinhaRotaPath(pathname)) return false;
  if (pathname.startsWith('/hub/leva-e-traz/motorista')) return false;
  if (pathname.startsWith('/hub/leva-e-traz/monitoramento')) return false;
  return true;
}

const links = [
  {
    to: '/hub/leva-e-traz',
    label: 'Rotas do dia',
    end: true,
    isActivePath: isRotasDoDiaPath,
  },
  {
    to: '/hub/leva-e-traz/minha-rota',
    label: 'Minha rota',
    end: true,
    isActivePath: isMinhaRotaPath,
  },
];

const HubPickupSubnav: React.FC = () => {
  const { hasPermission, loading: permLoading } = usePermissions();
  const driverOnly = isPickupDriverOnly(
    hasPermission('pickup.routes.manage'),
    hasPermission('pickup.stops.update'),
  );

  if (permLoading || driverOnly) return null;

  return <HubTabs ariaLabel="Leva e traz" items={links} />;
};

export default HubPickupSubnav;
