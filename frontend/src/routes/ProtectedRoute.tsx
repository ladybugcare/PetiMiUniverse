import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { Role, getDashboardPathForRole } from '../utils/authHelpers';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Role[]; // se omitido, qualquer usuário logado entra
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  // Não logado → manda pro login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logado, mas role não está autorizada pra essa rota
  if (allowedRoles && !allowedRoles.includes(role)) {
    const dashboard = getDashboardPathForRole(role);
    return <Navigate to={dashboard} replace />;
  }

  // Logado e autorizado
  return <>{children}</>;
};

export default ProtectedRoute;
