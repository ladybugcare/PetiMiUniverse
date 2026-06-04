import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubOrcamentosLayout from './HubOrcamentosLayout';
import HubQuotesPage from './HubQuotesPage';
import HubProspectsPage from './HubProspectsPage';
import HubQuoteNewPage from './HubQuoteNewPage';
import HubQuoteDetailPage from './HubQuoteDetailPage';
import HubQuoteEditPage from './HubQuoteEditPage';
import HubQuoteReadyToSendPage from './HubQuoteReadyToSendPage';

/**
 * Rotas sob `/hub/orcamentos/*`.
 */
const HubOrcamentosRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubOrcamentosLayout />}>
        <Route index element={<HubQuotesPage />} />
        <Route path="contactos" element={<Navigate to="/hub/orcamentos/contatos" replace />} />
        <Route path="contatos" element={<HubProspectsPage />} />
        <Route path="novo" element={<HubQuoteNewPage />} />
        <Route path=":id/pronto-para-envio" element={<HubQuoteReadyToSendPage />} />
        <Route path=":id/editar" element={<HubQuoteEditPage />} />
        <Route path=":id" element={<HubQuoteDetailPage />} />
        <Route path="*" element={<Navigate to="/hub/orcamentos" replace />} />
      </Route>
    </Routes>
  );
};

export default HubOrcamentosRoutes;
