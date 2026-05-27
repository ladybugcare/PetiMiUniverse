import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubServicosShell from './HubServicosShell';
import HubServiceTypesPage from '../HubServiceTypesPage';
import HubServiceTypeFormPage from './HubServiceTypeFormPage';
import HubServicosConfigPage from './HubServicosConfigPage';

/**
 * Rotas aninhadas sob `/hub/servicos/*` (parent define `path="servicos/*"`).
 */
const HubServicosRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubServicosShell />}>
        <Route index element={<Navigate to="servicos" replace />} />
        <Route path="servicos" element={<HubServiceTypesPage />} />
        <Route path="servicos/novo" element={<HubServiceTypeFormPage />} />
        <Route path="servicos/:id/editar" element={<HubServiceTypeFormPage />} />
        <Route path="configuracoes" element={<HubServicosConfigPage />} />
      </Route>
    </Routes>
  );
};

export default HubServicosRoutes;
