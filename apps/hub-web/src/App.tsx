import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@petimi/web-core';
import {
  AlertProvider,
  HubGuardiansPage,
  HubGuardianDetailPage,
  HubPetsPage,
  HubPetWizardPage,
  HubEstoqueRoutes,
  HubServicosRoutes,
  HubSystemSettingsRoutes,
  HubStaffPage,
  HubAgendaPage,
  HubOrcamentosRoutes,
  HubClinicRoutes,
  HubGroomingQueuePage,
  HubCaixaPage,
  HubFinanceiroPage,
  HubDashboardPage,
  HubRelatoriosPage,
} from '@petimi/hub-ui';
import HubProtectedRoute from './routes/HubProtectedRoute';
import HubLoginPage from './pages/HubLoginPage';
import HubSignUpPage from './pages/HubSignUpPage';
import HubEmailConfirmedPage from './pages/HubEmailConfirmedPage';
import HubClinicOnboardingPage from './pages/HubClinicOnboardingPage';
import HubAppShell from './components/HubAppShell';
import HubOnboardingGuard from './routes/HubOnboardingGuard';
import HubComingSoonPage from './pages/HubComingSoonPage';
import HubMeuPerfilPage from './pages/HubMeuPerfilPage';
import HubClinicaPerfilPage from './pages/HubClinicaPerfilPage';
import HubDesignSystemPage from './pages/HubDesignSystemPage';
import PublicQuotePage from './pages/PublicQuotePage';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AlertProvider>
        <Routes>
          <Route path="/meu-perfil" element={<Navigate to="/hub/meu-perfil" replace />} />
          <Route path="/login" element={<HubLoginPage />} />
          <Route path="/signup" element={<HubSignUpPage />} />
          <Route path="/email-confirmed" element={<HubEmailConfirmedPage />} />
          <Route path="/orcamento/:token" element={<PublicQuotePage />} />
          <Route
            path="/hub/onboarding/clinica"
            element={
              <HubProtectedRoute>
                <HubClinicOnboardingPage />
              </HubProtectedRoute>
            }
          />
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
                <HubOnboardingGuard>
                  <HubAppShell />
                </HubOnboardingGuard>
              </HubProtectedRoute>
            }
          >
            <Route index element={<Navigate to="clientes" replace />} />
            <Route path="dashboard" element={<HubDashboardPage />} />
            <Route path="appointments" element={<HubAgendaPage />} />
            <Route path="clientes" element={<HubGuardiansPage />} />
            <Route path="clientes/:guardianId" element={<HubGuardianDetailPage />} />
            <Route path="pets/novo" element={<HubPetWizardPage />} />
            <Route path="pets" element={<HubPetsPage />} />
            <Route path="financeiro" element={<HubFinanceiroPage />} />
            <Route path="caixa" element={<HubCaixaPage />} />
            <Route path="orcamentos/*" element={<HubOrcamentosRoutes />} />
            <Route path="servicos/*" element={<HubServicosRoutes />} />
            <Route path="clinica/*" element={<HubClinicRoutes />} />
            <Route
              path="hotel-creche"
              element={<HubComingSoonPage title="Hotel & Creche" />}
            />
            <Route path="banho-tosa" element={<HubGroomingQueuePage />} />
            <Route path="leva-e-traz" element={<HubComingSoonPage title="Leva e Traz" />} />
            <Route path="estoque/*" element={<HubEstoqueRoutes />} />
            <Route path="equipe" element={<HubStaffPage />} />
            <Route path="relatorios" element={<HubRelatoriosPage />} />
            <Route path="encounters" element={<Navigate to="/hub/clinica/atendimentos" replace />} />
            <Route path="meu-perfil" element={<HubMeuPerfilPage />} />
            <Route path="perfil-clinica" element={<HubClinicaPerfilPage />} />
            <Route path="design-system" element={<HubDesignSystemPage />} />
            <Route path="configuracoes-sistema/*" element={<HubSystemSettingsRoutes />} />
          </Route>
          <Route path="/" element={<Navigate to="/hub/clientes" replace />} />
          <Route path="*" element={<Navigate to="/hub/clientes" replace />} />
        </Routes>
      </AlertProvider>
    </AuthProvider>
  );
};

export default App;
