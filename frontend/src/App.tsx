import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AlertProvider } from './hooks/useAlert';
import { UnitProvider } from './contexts/UnitContext';
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
import VetPositionsPage from './pages/VetPositionsPage';
import './App.css';

function App() {
  return (
    <AlertProvider>
      <UnitProvider>
        <Router>
          <div className="App">
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/clinic-signup" element={<ClinicSignUpPage />} />
            <Route path="/vet-signup" element={<VetSignUpPage />} />
            <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/clinics" element={<AdminClinicsPage />} />
            <Route path="/admin/vets" element={<AdminVetsPage />} />
            <Route path="/admin/demands" element={<AdminDemandsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/clinic-dashboard" element={<ClinicDashboardPage />} />
            <Route path="/vet-dashboard" element={<VetDashboardPage />} />
            <Route path="/vet-positions" element={<VetPositionsPage />} />
            <Route path="/demands" element={<DemandsPage />} />
            <Route path="/create-demand" element={<CreateDemandPage />} />
            <Route path="/my-applications" element={<MyApplicationsPage />} />
            
            {/* Marketplace Routes */}
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/marketplace/create" element={<CreateMarketplaceListingPage />} />
            <Route path="/marketplace/:id" element={<MarketplaceItemDetailPage />} />
            <Route path="/marketplace/my-listings" element={<MyMarketplaceListingsPage />} />
            <Route path="/marketplace/messages" element={<MarketplaceMessagesPage />} />
            
            {/* Units & Users Management Routes */}
            <Route path="/units" element={<UnitsManagementPage />} />
            <Route path="/users" element={<UsersManagementPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            </Routes>
          </div>
        </Router>
      </UnitProvider>
    </AlertProvider>
  );
}

export default App;
