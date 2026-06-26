import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubSystemSettingsShell from './HubSystemSettingsShell';
import HubServicosConfigPage from '../servicos/HubServicosConfigPage';
import HubMessageTemplatesPage from './HubMessageTemplatesPage';

/**
 * Rotas aninhadas sob `/hub/configuracoes-sistema/*`.
 */
const HubSystemSettingsRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubSystemSettingsShell />}>
        <Route index element={<Navigate to="servicos-funcoes" replace />} />
        <Route path="servicos-funcoes" element={<HubServicosConfigPage />} />
        <Route path="templates-mensagem" element={<HubMessageTemplatesPage />} />
      </Route>
    </Routes>
  );
};

export default HubSystemSettingsRoutes;
