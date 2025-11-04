import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AlertProvider } from './hooks/useAlert';
import { UnitProvider } from './contexts/UnitContext';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import PublicRoute from './routes/PublicRoute';
import AuthListener from './components/AuthListener';
import { enforceEnvConsistency } from './utils/envGuard';
import './App.css';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ClinicSignUpPage from './pages/ClinicSignUpPage';
import VetSignUpPage from './pages/VetSignUpPage';
import DemandsPage from './pages/DemandsPage';
import CreateDemandPage from './pages/CreateDemandPage';
import MyApplicationsPage from './pages/MyApplicationsPage';
import ClinicDashboardPage from './pages/ClinicDashboardPage';
import VetDashboardPage from './pages/VetDashboardPage';
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
import AdminDemandsPage from './pages/AdminDemandsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminSupportTicketsPage from './pages/AdminSupportTicketsPage';
import VetPositionsPage from './pages/VetPositionsPage';
import VetProfilePage from './pages/VetProfilePage';
import ClinicProfilePage from './pages/ClinicProfilePage';
import MySupportTicketsPage from './pages/MySupportTicketsPage';
import AdminProfilePage from './pages/AdminProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import CreateFirstUnitPage from './pages/CreateFirstUnitPage';
import CreateUnitPage from './pages/CreateUnitPage';
import AdminPendingUnitsPage from './pages/AdminPendingUnitsPage';
import EmailConfirmedPage from './pages/EmailConfirmedPage';

if (!process.env.REACT_APP_SUPABASE_URL) {
  console.error('🚨 Faltando REACT_APP_SUPABASE_URL no ambiente. Verifique o .env!');
}

function App() {
  useEffect(() => {
    enforceEnvConsistency();
  }, []);

  return (
    <AlertProvider>
      <UnitProvider>
        <AuthProvider>
          <AuthListener />
          <div className="App">
            <Routes>
              {/* ROTAS PÚBLICAS (só para deslogados) */}
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
              <Route path="/email-confirmed" element={<EmailConfirmedPage />} />

              {/* ROTAS PROTEGIDAS GENÉRICAS (qualquer logado) */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/demands"
                element={
                  <ProtectedRoute>
                    <DemandsPage />
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
                path="/admin-profile"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminProfilePage />
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

              {/* VET */}
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

              {/* Marketplace (vale para clinic + vet, e se quiser também admin) */}
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

              {/* Genéricos de usuário logado */}
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
            </Routes>
          </div>
        </AuthProvider>
      </UnitProvider>
    </AlertProvider>
  );
}

export default App;
