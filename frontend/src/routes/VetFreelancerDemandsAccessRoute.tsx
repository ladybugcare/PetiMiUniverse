import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { getUserRole, getDashboardPathForRole } from '../utils/authHelpers';
import { canVetFreelancerAccessDemandsAndApplications } from '../utils/vetFreelancerDemandAccess';

/**
 * Bloqueia rotas de demandas/candidaturas para vet/freelancer enquanto o cadastro não estiver aprovado.
 * Clínicas e admins não são afetados.
 */
const VetFreelancerDemandsAccessRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', fontFamily: 'Inter, sans-serif', color: '#737373' }}>
        Carregando...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canVetFreelancerAccessDemandsAndApplications(user)) {
    const role = getUserRole(user);
    return <Navigate to={getDashboardPathForRole(role)} replace />;
  }

  return children;
};

export default VetFreelancerDemandsAccessRoute;
