import React from 'react';
import { useAuth, usePermissions } from '@petimi/web-core';
import { HubTabs } from '../../components/HubTabs';
import { isBoardingFloorStaff } from './boardingAccess';

const BASE = '/hub/hotel-creche';

function isUnder(pathname: string, sub: string): boolean {
  const p = `${BASE}/${sub}`;
  return pathname === p || pathname.startsWith(`${p}/`);
}

function isPainelPath(pathname: string): boolean {
  if (!pathname.startsWith(BASE)) return false;
  return !isUnder(pathname, 'minha-fila');
}

const HubBoardingSubnav: React.FC = () => {
  const { role } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const floorOnly = isBoardingFloorStaff(role, hasPermission('hub.appointments.write'));

  if (permLoading || floorOnly) return null;

  const links = [
    { to: BASE, label: 'Painel', end: true, isActivePath: isPainelPath },
    { to: `${BASE}/minha-fila`, label: 'Minha fila', end: true, isActivePath: (p: string) => isUnder(p, 'minha-fila') },
  ];

  return <HubTabs ariaLabel="Hotel e creche" items={links} />;
};

export default HubBoardingSubnav;
