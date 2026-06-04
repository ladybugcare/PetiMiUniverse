import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: 'atendimentos', label: 'Atendimentos' },
  { to: 'prontuarios', label: 'Prontuários', end: true },
  { to: 'internacoes', label: 'Internações', end: true },
  { to: 'cirurgias', label: 'Cirurgias', end: true },
  { to: 'templates', label: 'Templates', end: true },
];

const HubClinicSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Clínica" items={links} />;
};

export default HubClinicSubnav;
