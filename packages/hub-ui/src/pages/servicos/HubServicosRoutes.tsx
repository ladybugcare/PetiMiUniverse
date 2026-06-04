import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubServicosShell from './HubServicosShell';
import HubServiceTypesPage from '../HubServiceTypesPage';
import HubServiceTypeFormPage from './HubServiceTypeFormPage';
/**
 * Rotas aninhadas sob `/hub/servicos/*` (parent define `path="servicos/*"`).
 */
const HubServicosRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="configuracoes"
        element={<Navigate to="/hub/configuracoes-sistema/servicos-funcoes" replace />}
      />
      <Route element={<HubServicosShell />}>
        <Route index element={<Navigate to="servicos" replace />} />
        <Route path="servicos" element={<HubServiceTypesPage catalog="services" />} />
        <Route path="servicos/novo" element={<HubServiceTypeFormPage catalog="services" />} />
        <Route path="servicos/:id/editar" element={<HubServiceTypeFormPage catalog="services" />} />
        <Route path="adicionais" element={<HubServiceTypesPage catalog="addons" />} />
        <Route path="adicionais/novo" element={<HubServiceTypeFormPage catalog="addons" />} />
        <Route path="adicionais/:id/editar" element={<HubServiceTypeFormPage catalog="addons" />} />
      </Route>
    </Routes>
  );
};

export default HubServicosRoutes;
