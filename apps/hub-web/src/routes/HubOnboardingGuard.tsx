import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { needsHubClinicOnboarding } from '../utils/hubOnboardingState';

/** Redireciona CADMIN sem clínica para o onboarding Hub. */
const HubOnboardingGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  if (location.pathname.startsWith('/hub/onboarding')) {
    return <>{children}</>;
  }

  if (needsHubClinicOnboarding()) {
    return <Navigate to="/hub/onboarding/clinica" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default HubOnboardingGuard;
