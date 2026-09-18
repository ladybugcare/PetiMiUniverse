import React from 'react';
import { useAuth, usePermissions } from '@petimi/web-core';
import { HubTabs } from '../../components/HubTabs';
import { isBoardingFloorStaff } from './boardingAccess';

function isMinhaFilaPath(pathname: string): boolean {
  return pathname === '/hub/hotel-creche/minha-fila' || pathname.startsWith('/hub/hotel-creche/minha-fila/');
}

function isFilaDoDiaPath(pathname: string): boolean {
  if (!pathname.startsWith('/hub/hotel-creche')) return false;
  return !isMinhaFilaPath(pathname);
}

const links = [
  {
    to: '/hub/hotel-creche',
    label: 'Fila do dia',
    end: true,
    isActivePath: isFilaDoDiaPath,
  },
  {
    to: '/hub/hotel-creche/minha-fila',
    label: 'Minha fila',
    end: true,
    isActivePath: isMinhaFilaPath,
  },
];

const HubBoardingSubnav: React.FC = () => {
  const { role } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const floorOnly = isBoardingFloorStaff(role, hasPermission('hub.appointments.write'));

  if (permLoading || floorOnly) return null;

  return <HubTabs ariaLabel="Hotel e creche" items={links} />;
};

export default HubBoardingSubnav;
