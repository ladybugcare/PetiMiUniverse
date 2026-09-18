import React from 'react';
import { useAuth, usePermissions } from '@petimi/web-core';
import { HubTabs } from '../../components/HubTabs';
import { isGroomingFloorStaff } from './groomingAccess';

function isMinhaFilaPath(pathname: string): boolean {
  return pathname === '/hub/banho-tosa/minha-fila' || pathname.startsWith('/hub/banho-tosa/minha-fila/');
}

function isFilaDoDiaPath(pathname: string): boolean {
  if (!pathname.startsWith('/hub/banho-tosa')) return false;
  return !isMinhaFilaPath(pathname);
}

const links = [
  {
    to: '/hub/banho-tosa',
    label: 'Fila do dia',
    end: true,
    isActivePath: isFilaDoDiaPath,
  },
  {
    to: '/hub/banho-tosa/minha-fila',
    label: 'Minha fila',
    end: true,
    isActivePath: isMinhaFilaPath,
  },
];

const HubGroomingSubnav: React.FC = () => {
  const { role } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const floorOnly = isGroomingFloorStaff(role, hasPermission('hub.appointments.write'));

  if (permLoading || floorOnly) return null;

  return <HubTabs ariaLabel="Banho e tosa" items={links} />;
};

export default HubGroomingSubnav;
