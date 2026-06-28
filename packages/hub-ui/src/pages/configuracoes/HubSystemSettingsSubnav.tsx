import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: 'servicos-funcoes', label: 'Serviços e Funções' },
  { to: 'templates-mensagem', label: 'Templates de Mensagem' },
  { to: 'checklists', label: 'Checklists operacionais' },
  { to: 'formas-pagamento', label: 'Formas de pagamento' },
];

const HubSystemSettingsSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Secções de configurações do sistema" items={links} />;
};

export default HubSystemSettingsSubnav;
