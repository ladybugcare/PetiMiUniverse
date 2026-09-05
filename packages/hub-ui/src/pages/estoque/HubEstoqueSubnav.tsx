import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const BASE = '/hub/estoque';

const links = [
  { to: `${BASE}/itens`, label: 'Itens', end: true as const },
  { to: `${BASE}/movimentos`, label: 'Movimentos' },
  { to: `${BASE}/alertas`, label: 'Alertas' },
  { to: `${BASE}/inventario`, label: 'Inventário' },
  { to: `${BASE}/fornecedores`, label: 'Fornecedores' },
];

const HubEstoqueSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Seções de estoque" items={links} />;
};

export default HubEstoqueSubnav;
