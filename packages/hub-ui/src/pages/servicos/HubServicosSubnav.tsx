import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: 'servicos', label: 'Serviços', end: true as const },
  { to: 'adicionais', label: 'Adicionais' },
];

const HubServicosSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Secções de serviços" items={links} />;
};

export default HubServicosSubnav;
