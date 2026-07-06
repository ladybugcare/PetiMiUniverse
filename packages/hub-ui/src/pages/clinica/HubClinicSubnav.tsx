import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: '/hub/clinica', label: 'Consultório', end: true },
  { to: '/hub/clinica/atendimentos', label: 'Operação clínica' },
  { to: '/hub/clinica/prontuarios', label: 'Pacientes', end: true },
  { to: '/hub/clinica/internacoes', label: 'Internações', end: true },
  { to: '/hub/clinica/cirurgias', label: 'Cirurgias', end: true },
];

const HubClinicSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Clínica" items={links} />;
};

export default HubClinicSubnav;
