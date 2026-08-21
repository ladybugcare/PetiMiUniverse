import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: '/hub/servicos/servicos', label: 'Serviços', end: true as const },
  { to: '/hub/servicos/adicionais', label: 'Adicionais' },
  { to: '/hub/servicos/pacotes', label: 'Pacotes' },
];

const HubServicosSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Secções de serviços" items={links} />;
};

export default HubServicosSubnav;
