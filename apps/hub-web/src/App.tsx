import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@petimi/web-core';
import {
  AlertProvider,
  HubGuardiansPage,
  HubGuardianDetailPage,
  HubPetsPage,
  HubPetWizardPage,
  HubServiceTypesPage,
  HubEstoqueRoutes,
  HubStaffPage,
  HubAgendaPage,
} from '@petimi/hub-ui';
import HubProtectedRoute from './routes/HubProtectedRoute';
import HubLoginPage from './pages/HubLoginPage';
import HubAppShell from './components/HubAppShell';
import HubComingSoonPage from './pages/HubComingSoonPage';
import HubMeuPerfilPage from './pages/HubMeuPerfilPage';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AlertProvider>
        <Routes>
          <Route path="/meu-perfil" element={<Navigate to="/hub/meu-perfil" replace />} />
          <Route path="/login" element={<HubLoginPage />} />
          <Route
            path="/hub/guardians"
            element={<Navigate to="/hub/clientes" replace />}
          />
          <Route
            path="/hub/service-types"
            element={<Navigate to="/hub/servicos" replace />}
          />
          <Route
            path="/hub"
            element={
              <HubProtectedRoute>
                <HubAppShell />
              </HubProtectedRoute>
            }
          >
            <Route index element={<Navigate to="clientes" replace />} />
            <Route path="dashboard" element={<HubComingSoonPage title="Dashboard" />} />
            <Route path="appointments" element={<HubAgendaPage />} />
            <Route path="clientes" element={<HubGuardiansPage />} />
            <Route path="clientes/:guardianId" element={<HubGuardianDetailPage />} />
            <Route path="pets/novo" element={<HubPetWizardPage />} />
            <Route path="pets" element={<HubPetsPage />} />
            <Route path="financeiro" element={<HubComingSoonPage title="Financeiro" />} />
            <Route path="servicos" element={<HubServiceTypesPage />} />
            <Route
              path="hotel-creche"
              element={<HubComingSoonPage title="Hotel & Creche" />}
            />
            <Route path="banho-tosa" element={<HubComingSoonPage title="Banho & Tosa" />} />
            <Route path="estoque/*" element={<HubEstoqueRoutes />} />
            <Route path="equipe" element={<HubStaffPage />} />
            <Route path="relatorios" element={<HubComingSoonPage title="Relatórios" />} />
            <Route path="marketplace" element={<HubComingSoonPage title="Marketplace" />} />
            <Route path="encounters" element={<HubComingSoonPage title="Atendimentos" />} />
            <Route path="meu-perfil" element={<HubMeuPerfilPage />} />
            <Route
              path="configuracoes-sistema"
              element={
                <HubComingSoonPage
                  title="Configurações do Sistema"
                  description="Preferências e configurações da clínica no Hub. Funcionalidade em preparação."
                />
              }
            />
          </Route>
          <Route path="/" element={<Navigate to="/hub/clientes" replace />} />
          <Route path="*" element={<Navigate to="/hub/clientes" replace />} />
        </Routes>
      </AlertProvider>
    </AuthProvider>
  );
};

export default App;
