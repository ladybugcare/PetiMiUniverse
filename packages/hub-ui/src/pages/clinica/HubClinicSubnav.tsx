import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const PRONTUARIO_PREFIXES = ['/hub/clinica/prontuarios', '/hub/clinica/casos'];

function isProntuariosPath(pathname: string): boolean {
  return PRONTUARIO_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isConsultorioPath(pathname: string): boolean {
  if (!pathname.startsWith('/hub/clinica')) return false;
  return !isProntuariosPath(pathname);
}

/** Duas abas: operação do dia (consultório) × arquivo clínico (prontuários). */
const links = [
  {
    to: '/hub/clinica',
    label: 'Consultório',
    end: true,
    isActivePath: isConsultorioPath,
  },
  {
    to: '/hub/clinica/prontuarios',
    label: 'Prontuários',
    end: true,
    isActivePath: isProntuariosPath,
  },
];

const HubClinicSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Clínica" items={links} />;
};

export default HubClinicSubnav;
