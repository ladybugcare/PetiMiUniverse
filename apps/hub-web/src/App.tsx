import React from 'react';
import {
  Route,
  Navigate,
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  useParams,
} from 'react-router-dom';
import { AuthProvider } from '@petimi/web-core';
import {
  AlertProvider,
  HubGuardiansPage,
  HubGuardianDetailPage,
  HubPetsPage,
  HubPetDetailPage,
  HubPetWizardPage,
  HubEstoqueRoutes,
  HubServicosRoutes,
  HubSystemSettingsRoutes,
  HubStaffPage,
  HubAgendaPage,
  HubOrcamentosRoutes,
  HubClinicRoutes,
  HubGroomingQueuePage,
  HubBoardingPage,
  HubPickupPage,
  PickupDriverView,
  PickupMyRoutePage,
  PickupRouteMonitorPage,
  HubCaixaPage,
  HubComandaPage,
  HubComandaFinancePage,
  HubComandaReadyToSendPage,
  HubChargeBundleReadyToSendPage,
  HubFinanceiroPage,
  HubDashboardPage,
  HubRelatoriosPage,
} from '@petimi/hub-ui';
import HubProtectedRoute from './routes/HubProtectedRoute';
import HubLoginPage from './pages/HubLoginPage';
import HubSignUpPage from './pages/HubSignUpPage';
import HubEmailConfirmedPage from './pages/HubEmailConfirmedPage';
import HubAcceptInvitationPage from './pages/HubAcceptInvitationPage';
import HubInviteSignUpPage from './pages/HubInviteSignUpPage';
import HubClinicOnboardingPage from './pages/HubClinicOnboardingPage';
import HubAppShell from './components/HubAppShell';
import { HubUnitProvider } from './contexts/HubUnitContext';
import { HubCashSessionProvider } from './contexts/HubCashSessionContext';
import HubOnboardingGuard from './routes/HubOnboardingGuard';
import HubMeuPerfilPage from './pages/HubMeuPerfilPage';
import HubNotificationsPage from './pages/HubNotificationsPage';
import HubClinicaPerfilPage from './pages/HubClinicaPerfilPage';
import HubDesignSystemPage from './pages/HubDesignSystemPage';
import PublicQuotePage from './pages/PublicQuotePage';
import PublicComandaPage from './pages/PublicComandaPage';
import PublicChargeBundlePage from './pages/PublicChargeBundlePage';
import PublicPrescriptionPage from './pages/PublicPrescriptionPage';
import ValidatePrescriptionPage from './pages/ValidatePrescriptionPage';
import PublicExamOrderPage from './pages/PublicExamOrderPage';
import PublicSpecialistReferralPage from './pages/PublicSpecialistReferralPage';
import ValidateExamOrderPage from './pages/ValidateExamOrderPage';
import ValidateSpecialistReferralPage from './pages/ValidateSpecialistReferralPage';
import HubHomePage from './pages/HubHomePage';

function PickupDriverViewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  if (!routeId) return <p style={{ padding: '1rem' }}>ID de rota inválido.</p>;
  return <PickupDriverView routeId={routeId} />;
}

function PickupRouteMonitorViewPage() {
  const { routeId } = useParams<{ routeId: string }>();
  if (!routeId) return <p style={{ padding: '1rem' }}>ID de rota inválido.</p>;
  return <PickupRouteMonitorPage routeId={routeId} />;
}

/** Providers do hub autenticado — ficam fora do shell visual para o contexto sempre envolver o Outlet. */
function HubAuthenticatedLayout() {
  return (
    <HubUnitProvider>
      <HubCashSessionProvider>
        <HubAppShell />
      </HubCashSessionProvider>
    </HubUnitProvider>
  );
}

/** Data router — necessário para useBlocker (guard de saída do caixa). */
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/meu-perfil" element={<Navigate to="/hub/meu-perfil" replace />} />
      <Route path="/login" element={<HubLoginPage />} />
      <Route path="/signup" element={<HubSignUpPage />} />
      <Route path="/accept-invitation" element={<HubAcceptInvitationPage />} />
      <Route path="/signup-convite" element={<HubInviteSignUpPage />} />
      <Route path="/email-confirmed" element={<HubEmailConfirmedPage />} />
      <Route path="/orcamento/:token" element={<PublicQuotePage />} />
      <Route path="/comanda/:token" element={<PublicComandaPage />} />
      <Route path="/cobranca/:token" element={<PublicChargeBundlePage />} />
      <Route path="/receita/:token" element={<PublicPrescriptionPage />} />
      <Route path="/validar-receita" element={<ValidatePrescriptionPage />} />
      <Route path="/solicitacao-exame/:token" element={<PublicExamOrderPage />} />
      <Route path="/validar-exame" element={<ValidateExamOrderPage />} />
      <Route path="/encaminhamento/:token" element={<PublicSpecialistReferralPage />} />
      <Route path="/validar-encaminhamento" element={<ValidateSpecialistReferralPage />} />
      <Route
        path="/hub/onboarding/clinica"
        element={
          <HubProtectedRoute>
            <HubClinicOnboardingPage />
          </HubProtectedRoute>
        }
      />
      <Route path="/hub/guardians" element={<Navigate to="/hub/clientes" replace />} />
      <Route path="/hub/service-types" element={<Navigate to="/hub/servicos" replace />} />
      <Route
        path="/hub"
        element={
          <HubProtectedRoute>
            <HubOnboardingGuard>
              <HubAuthenticatedLayout />
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
        <Route path="pets/:petId/editar" element={<HubPetWizardPage />} />
        <Route path="pets/:petId" element={<HubPetDetailPage />} />
        <Route path="pets" element={<HubPetsPage />} />
        <Route path="financeiro" element={<HubFinanceiroPage />} />
        <Route path="financeiro/comanda/:id" element={<HubComandaFinancePage />} />
        <Route path="financeiro/comanda/:id/pronto-para-envio" element={<HubComandaReadyToSendPage />} />
        <Route path="financeiro/cobranca-lote/:bundleId/pronto-para-envio" element={<HubChargeBundleReadyToSendPage />} />
        <Route path="caixa" element={<HubCaixaPage />} />
        <Route path="caixa/comanda/:id" element={<HubComandaPage />} />
        <Route path="caixa/comanda/:id/pronto-para-envio" element={<HubComandaReadyToSendPage />} />
        <Route path="orcamentos/*" element={<HubOrcamentosRoutes />} />
        <Route path="servicos/*" element={<HubServicosRoutes />} />
        <Route path="clinica/*" element={<HubClinicRoutes />} />
        <Route path="hotel-creche" element={<HubBoardingPage />} />
        <Route path="banho-tosa" element={<HubGroomingQueuePage />} />
        <Route path="leva-e-traz" element={<HubPickupPage />} />
        <Route path="leva-e-traz/minha-rota" element={<PickupMyRoutePage />} />
        <Route path="leva-e-traz/motorista/:routeId" element={<PickupDriverViewPage />} />
        <Route path="leva-e-traz/monitoramento/:routeId" element={<PickupRouteMonitorViewPage />} />
        <Route path="estoque/*" element={<HubEstoqueRoutes />} />
        <Route path="equipe" element={<HubStaffPage />} />
        <Route path="relatorios" element={<HubRelatoriosPage />} />
        <Route path="encounters" element={<Navigate to="/hub/clinica" replace />} />
        <Route path="notificacoes" element={<HubNotificationsPage />} />
        <Route path="meu-perfil" element={<HubMeuPerfilPage />} />
        <Route path="perfil-clinica" element={<HubClinicaPerfilPage />} />
        <Route path="design-system" element={<HubDesignSystemPage />} />
        <Route path="configuracoes-sistema/*" element={<HubSystemSettingsRoutes />} />
      </Route>
      <Route path="/" element={<HubHomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
  {
    future: {
      v7_relativeSplatPath: true,
    },
  },
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AlertProvider>
        <RouterProvider router={router} />
      </AlertProvider>
    </AuthProvider>
  );
};

export default App;
