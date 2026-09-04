import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const BASE = '/hub/estoque';

const links = [
  { to: `${BASE}/produtos`, label: 'Produtos', end: true as const },
  { to: `${BASE}/medicamentos`, label: 'Medicamentos' },
  { to: `${BASE}/vacinas`, label: 'Vacinas' },
  { to: `${BASE}/entradas`, label: 'Entradas' },
  { to: `${BASE}/saidas`, label: 'Saídas' },
  { to: `${BASE}/validade`, label: 'Validade' },
  { to: `${BASE}/alertas`, label: 'Alertas' },
  { to: `${BASE}/inventario`, label: 'Inventário' },
  { to: `${BASE}/fornecedores`, label: 'Fornecedores' },
];

const HubEstoqueSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Seções de estoque" items={links} />;
};

export default HubEstoqueSubnav;
