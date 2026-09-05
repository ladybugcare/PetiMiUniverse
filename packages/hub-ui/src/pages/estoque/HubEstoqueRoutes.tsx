import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HubEstoqueShell from './HubEstoqueShell';
import HubEstoqueItemsPage from './HubEstoqueItemsPage';
import HubEstoqueMovementsPage from './HubEstoqueMovementsPage';
import HubEstoqueAlertasPage from './HubEstoqueAlertasPage';
import HubEstoqueInventarioPage from './HubEstoqueInventarioPage';
import HubEstoqueFornecedoresPage from './HubEstoqueFornecedoresPage';
import HubEstoqueLegacyRedirect from './HubEstoqueLegacyRedirect';

/**
 * Rotas aninhadas sob `/hub/estoque/*` (parent define `path="estoque/*"`).
 * Rotas antigas (produtos/medicamentos/vacinas/entradas/saídas/validade) redirecionam com filtros.
 */
const HubEstoqueRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<HubEstoqueShell />}>
        <Route index element={<HubEstoqueLegacyRedirect to="itens" />} />
        <Route path="itens" element={<HubEstoqueItemsPage />} />
        <Route path="movimentos" element={<HubEstoqueMovementsPage />} />
        <Route path="alertas" element={<HubEstoqueAlertasPage />} />
        <Route path="inventario" element={<HubEstoqueInventarioPage />} />
        <Route path="fornecedores" element={<HubEstoqueFornecedoresPage />} />
        <Route
          path="produtos"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/itens" defaults={{ kind: 'product' }} />}
        />
        <Route
          path="medicamentos"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/itens" defaults={{ kind: 'medication' }} />}
        />
        <Route
          path="vacinas"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/itens" defaults={{ kind: 'vaccine' }} />}
        />
        <Route
          path="entradas"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/movimentos" defaults={{ direction: 'in' }} />}
        />
        <Route
          path="saidas"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/movimentos" defaults={{ direction: 'out' }} />}
        />
        <Route
          path="validade"
          element={<HubEstoqueLegacyRedirect to="/hub/estoque/alertas" defaults={{ view: 'validade' }} />}
        />
        <Route path="*" element={<Navigate to="/hub/estoque/itens" replace />} />
      </Route>
    </Routes>
  );
};

export default HubEstoqueRoutes;
