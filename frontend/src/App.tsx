import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AlertProvider } from './hooks/useAlert';
import { UnitProvider } from './contexts/UnitContext';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import PublicRoute from './routes/PublicRoute';
import AuthListener from './components/AuthListener';
import ErrorBoundary from './components/ErrorBoundary';
import { enforceEnvConsistency } from './utils/envGuard';
import './App.css';

// Páginas
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ClinicSignUpPage from './pages/ClinicSignUpPage';
import VetSignUpPage from './pages/VetSignUpPage';
import FreelancerSignUpPage from './pages/FreelancerSignUpPage';
import DemandsPage from './pages/DemandsPage';
import CreateDemandPage from './pages/CreateDemandPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import ClinicDashboardPage from './pages/ClinicDashboardPage';
import ClinicReportsPage from './pages/ClinicReportsPage';
import VetDashboardPage from './pages/VetDashboardPage';
import FreelancerDashboardPage from './pages/FreelancerDashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import CreateMarketplaceListingPage from './pages/CreateMarketplaceListingPage';
import MarketplaceItemDetailPage from './pages/MarketplaceItemDetailPage';
import MyMarketplaceListingsPage from './pages/MyMarketplaceListingsPage';
import MarketplaceMessagesPage from './pages/MarketplaceMessagesPage';
import UnitsManagementPage from './pages/UnitsManagementPage';
import UsersManagementPage from './pages/UsersManagementPage';
import AcceptInvitationPage from './pages/AcceptInvitationPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminClinicsPage from './pages/AdminClinicsPage';
import AdminVetsPage from './pages/AdminVetsPage';
import AdminFreelancersPage from './pages/AdminFreelancersPage';
import AdminDemandsPage from './pages/AdminDemandsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSupportTicketsPage from './pages/AdminSupportTicketsPage';
import AdminReportsPage from './pages/AdminReportsPage';
import VetOnboardingPage from './pages/VetOnboardingPage';
import FreelancerOnboardingPage from './pages/FreelancerOnboardingPage';
import VetPositionsPage from './pages/VetPositionsPage';
import VetProfilePage from './pages/VetProfilePage';
import ClinicProfilePage from './pages/ClinicProfilePage';
import MySupportTicketsPage from './pages/MySupportTicketsPage';
import AdminProfilePage from './pages/AdminProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import CreateFirstUnitPage from './pages/CreateFirstUnitPage';
import CreateUnitPage from './pages/CreateUnitPage';
import UnitProfilePage from './pages/UnitProfilePage';
import ClinicApplicationsPage from './pages/ClinicApplicationsPage';
import ClinicDemandsPage from './pages/ClinicDemandsPage';
import AdminPendingUnitsPage from './pages/AdminPendingUnitsPage';
import AdminPendingVetsPage from './pages/AdminPendingVetsPage';
import AdminPendingFreelancersPage from './pages/AdminPendingFreelancersPage';
import AdminPendingAllPage from './pages/AdminPendingAllPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import EmailConfirmedPage from './pages/EmailConfirmedPage';
import DemandDetailPage from './pages/DemandDetailPage';
import MessagesPage from './pages/MessagesPage';


if (!process.env.REACT_APP_SUPABASE_URL) {
  console.error('🚨 Faltando REACT_APP_SUPABASE_URL no ambiente. Verifique o .env!');
}

function App() {
  useEffect(() => {
    enforceEnvConsistency();
  }, []);

  return (
    <ErrorBoundary>
      <AlertProvider>
        <UnitProvider>
          <AuthProvider>
            <AuthListener />
            <div className="App">
              <Routes>
              {/* ROTAS PÚBLICAS */}
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <LoginPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <PublicRoute>
                    <ForgotPasswordPage />
                  </PublicRoute>
                }
              />

              {/* Signup — protegidas: redirecionam se já logado */}
              <Route
                path="/clinic-signup"
                element={
                  <PublicRoute>
                    <ClinicSignUpPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/vet-signup"
                element={
                  <PublicRoute>
                    <VetSignUpPage />
                  </PublicRoute>
                }
              />
              <Route
                path="/freelancer-signup"
                element={
                  <PublicRoute>
                    <FreelancerSignUpPage />
                  </PublicRoute>
                }
              />

              <Route path="/email-confirmed" element={<EmailConfirmedPage />} />

              {/* ROTA PÚBLICA - HomePage (landing page) */}
              <Route path="/" element={<HomePage />} />

              {/* ROTAS PROTEGIDAS GENÉRICAS (qualquer logado) */}
              <Route
                path="/demands"
                element={
                  <ProtectedRoute>
                    <DemandsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/demands/:id"
                element={
                  <ProtectedRoute>
                    <DemandDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/create-demand"
                element={
                  <ProtectedRoute>
                    <CreateDemandPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-applications"
                element={
                  <ProtectedRoute>
                    <MyApplicationsPage />
                  </ProtectedRoute>
                }
              />

              {/* ADMIN ONLY */}
              <Route
                path="/admin-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/clinics"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminClinicsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/vets"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminVetsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/freelancers"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminFreelancersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/demands"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminDemandsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/support-tickets"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminSupportTicketsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminUsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pending-units"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPendingUnitsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pending-vets"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPendingVetsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pending-freelancers"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPendingFreelancersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/pending-all"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPendingAllPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin-profile"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminSettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* CLÍNICA (CADMIN / CMANAGER) */}
              <Route
                path="/clinic-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <ClinicDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/units"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <UnitsManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/units/create-first"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <CreateFirstUnitPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/units/create"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <CreateUnitPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/units/:unitId"
                element={
                  <ProtectedRoute>
                    <UnitProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <UsersManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clinic-profile"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <ClinicProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clinic-profile/:id"
                element={
                  <ProtectedRoute>
                    <ClinicProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clinic-reports"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <ClinicReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clinic-applications"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <ClinicApplicationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clinic-demands"
                element={
                  <ProtectedRoute allowedRoles={['CADMIN', 'CMANAGER']}>
                    <ClinicDemandsPage />
                  </ProtectedRoute>
                }
              />

              {/* VET */}
              <Route
                path="/vet-onboarding"
                element={
                  <ProtectedRoute allowedRoles={['VET']}>
                    <VetOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vet-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['VET']}>
                    <VetDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vet-positions"
                element={
                  <ProtectedRoute allowedRoles={['VET']}>
                    <VetPositionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vet-profile"
                element={
                  <ProtectedRoute allowedRoles={['VET']}>
                    <VetProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vet-profile/:id"
                element={
                  <ProtectedRoute>
                    <VetProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* FREELANCER */}
              <Route
                path="/freelancer-onboarding"
                element={
                  <ProtectedRoute allowedRoles={['FREELANCER']}>
                    <FreelancerOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/freelancer-dashboard"
                element={
                  <ProtectedRoute allowedRoles={['FREELANCER']}>
                    <FreelancerDashboardPage />
                  </ProtectedRoute>
                }
              />

              {/* Marketplace */}
              <Route
                path="/marketplace"
                element={
                  <ProtectedRoute>
                    <MarketplacePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketplace/create"
                element={
                  <ProtectedRoute>
                    <CreateMarketplaceListingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketplace/:id"
                element={
                  <ProtectedRoute>
                    <MarketplaceItemDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketplace/my-listings"
                element={
                  <ProtectedRoute>
                    <MyMarketplaceListingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/marketplace/messages"
                element={
                  <ProtectedRoute>
                    <MarketplaceMessagesPage />
                  </ProtectedRoute>
                }
              />

              {/* Genéricos */}
              <Route
                path="/accept-invitation"
                element={
                  <ProtectedRoute>
                    <AcceptInvitationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-support-tickets"
                element={
                  <ProtectedRoute>
                    <MySupportTicketsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </AuthProvider>
      </UnitProvider>
    </AlertProvider>
    </ErrorBoundary>
  );
}

export default App;
