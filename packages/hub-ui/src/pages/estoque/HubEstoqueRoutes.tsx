import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubEstoqueShell from './HubEstoqueShell';
import HubEstoqueItemsPage from './HubEstoqueItemsPage';
import HubEstoqueMovementsPage from './HubEstoqueMovementsPage';
import HubEstoqueValidadePage from './HubEstoqueValidadePage';
import HubEstoqueAlertasPage from './HubEstoqueAlertasPage';
import HubEstoqueInventarioPage from './HubEstoqueInventarioPage';

/**
 * Rotas aninhadas sob `/hub/estoque/*` (parent define `path="estoque/*"`).
 */
const HubEstoqueRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubEstoqueShell />}>
        <Route index element={<Navigate to="produtos" replace />} />
        <Route path="produtos" element={<HubEstoqueItemsPage itemKind="product" />} />
        <Route path="medicamentos" element={<HubEstoqueItemsPage itemKind="medication" />} />
        <Route path="vacinas" element={<HubEstoqueItemsPage itemKind="vaccine" />} />
        <Route path="entradas" element={<HubEstoqueMovementsPage />} />
        <Route path="saidas" element={<HubEstoqueMovementsPage />} />
        <Route path="validade" element={<HubEstoqueValidadePage />} />
        <Route path="alertas" element={<HubEstoqueAlertasPage />} />
        <Route path="inventario" element={<HubEstoqueInventarioPage />} />
      </Route>
    </Routes>
  );
};

export default HubEstoqueRoutes;
