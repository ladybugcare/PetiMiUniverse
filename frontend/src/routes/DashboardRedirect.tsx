import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { getDashboardPathForRole, getUserRole } from '../utils/authHelpers';

/**
 * Redirect legado `/dashboard` para o painel correto conforme a role JWT.
 */
const DashboardRedirect: React.FC = () => {
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

  return <Navigate to={getDashboardPathForRole(getUserRole(user))} replace />;
};

export default DashboardRedirect;
