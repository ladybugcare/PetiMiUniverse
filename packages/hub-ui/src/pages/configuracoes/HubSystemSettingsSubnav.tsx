import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const BASE = '/hub/configuracoes-sistema';

const links = [
  { to: `${BASE}/servicos-funcoes`, label: 'Serviços e Funções' },
  { to: `${BASE}/templates-mensagem`, label: 'Templates de Mensagem' },
  { to: `${BASE}/checklists`, label: 'Checklists operacionais' },
  { to: `${BASE}/formas-pagamento`, label: 'Formas de pagamento' },
  { to: `${BASE}/clinicas-parceiras`, label: 'Clínicas parceiras' },
  { to: `${BASE}/leva-e-traz`, label: 'Leva e Traz' },
];

const HubSystemSettingsSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Seções de configurações do sistema" items={links} />;
};

export default HubSystemSettingsSubnav;
