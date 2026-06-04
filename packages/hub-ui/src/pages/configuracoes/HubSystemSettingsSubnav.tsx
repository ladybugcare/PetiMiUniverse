import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [{ to: 'servicos-funcoes', label: 'Serviços e Funções' }];

const HubSystemSettingsSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Secções de configurações do sistema" items={links} />;
};

export default HubSystemSettingsSubnav;
