import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { getDashboardPathForRole } from '../utils/authHelpers';

interface PublicRouteProps {
  children: ReactNode;
}

const PublicRoute = ({ children }: PublicRouteProps) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  // Se já estiver logado, não faz sentido ver login/cadastro
  if (user) {
    const dashboard = getDashboardPathForRole(role);
    return <Navigate to={dashboard} replace />;
  }

  // Deslogado → pode ver normalmente
  return <>{children}</>;
};

export default PublicRoute;
