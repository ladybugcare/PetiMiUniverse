import React from 'react';
import { HubTabs } from '../../components/HubTabs';

const links = [
  { to: 'produtos', label: 'Produtos' },
  { to: 'medicamentos', label: 'Medicamentos' },
  { to: 'vacinas', label: 'Vacinas' },
  { to: 'entradas', label: 'Entradas' },
  { to: 'saidas', label: 'Saídas' },
  { to: 'validade', label: 'Validade' },
  { to: 'alertas', label: 'Alertas' },
  { to: 'inventario', label: 'Inventário' },
];

const HubEstoqueSubnav: React.FC = () => {
  return <HubTabs ariaLabel="Secções de estoque" items={links} />;
};

export default HubEstoqueSubnav;
