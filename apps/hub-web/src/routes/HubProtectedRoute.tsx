import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@petimi/web-core';
import { HUB_VALID_ROLES } from '../authNavigation';

/** Reads the server-assigned clinic_user role from localStorage (set by setAuthFromLogin). */
function getStoredClinicUserRole(): string | null {
  try {
    const raw = localStorage.getItem('clinic_user');
    if (raw) {
      const cu = JSON.parse(raw) as { role?: string };
      if (cu?.role) return String(cu.role).toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

const HubProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 24 }}>Carregando…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check role from auth context (derived from user_metadata) and, as a
  // more reliable fallback, the clinic_user row the server persisted at login.
  const storedRole = getStoredClinicUserRole();
  const isHubUser =
    HUB_VALID_ROLES.includes(role) ||
    (storedRole !== null && (HUB_VALID_ROLES as string[]).includes(storedRole));

  if (!isHubUser) {
    return (
      <div
        style={{
          padding: 48,
          maxWidth: 480,
          margin: '80px auto',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: 12 }}>Acesso não autorizado</h2>
        <p style={{ color: '#666', lineHeight: 1.6 }}>
          A sua conta não tem acesso ao PetMi Hub. O Hub é exclusivo para staff de clínica.
        </p>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            marginTop: 24,
            padding: '10px 24px',
            background: '#c86a4d',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Voltar ao login
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

export default HubProtectedRoute;
