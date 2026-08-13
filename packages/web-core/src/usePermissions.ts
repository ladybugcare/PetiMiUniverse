import { useState, useEffect, useCallback } from 'react';
import { mergePermissionsForRoleAndAreas, hasEffectivePermission } from './permissions';
import type { HubOperationalArea } from './operationalAreas';
import { sanitizeOperationalAreas } from './operationalAreas';
import type { AppRole, ClinicStaffRole } from './types';
import { CLINIC_STORAGE_UPDATED_EVENT } from './constants/appEvents';
import { getUserRole } from './authHelpers';
import { useAuth } from './AuthContext';
import { PERMISSIONS } from './permissions';

function isHubStaffRoleKey(r: string): r is ClinicStaffRole {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, r);
}

/** Lê o papel persistido em `clinic_user` (linha de staff gravada pelo servidor no login). */
function readClinicUserRole(): ClinicStaffRole | null {
  try {
    const raw = localStorage.getItem('clinic_user');
    if (!raw) return null;
    const cu = JSON.parse(raw) as { role?: unknown };
    if (cu?.role != null && String(cu.role).trim() !== '') {
      const normalized = String(cu.role).trim().toUpperCase();
      if (isHubStaffRoleKey(normalized)) return normalized;
    }
  } catch {
    /* clinic_user inválido — ignora */
  }
  return null;
}

/** Lê áreas operacionais persistidas em `clinic_user`. */
function readClinicUserOperationalAreas(): HubOperationalArea[] {
  try {
    const raw = localStorage.getItem('clinic_user');
    if (!raw) return [];
    const cu = JSON.parse(raw) as { operational_areas?: unknown };
    return sanitizeOperationalAreas(cu?.operational_areas);
  } catch {
    return [];
  }
}

/**
 * Resolve o papel para permissões do Hub usando as MESMAS fontes que o
 * HubProtectedRoute, por ordem de confiança:
 *   1. `clinic_user.role` (linha de staff específica da clínica);
 *   2. o papel do AuthContext (`useAuth().role`, derivado da sessão Supabase) — é o
 *      que já autoriza a entrada no Hub, então garante consistência;
 *   3. `getUserRole(user)` como reforço.
 *
 * Antes, o hook dependia só do `localStorage`; quando `clinic_user.role` vinha vazio,
 * `role` ficava `null`, as páginas disparavam `redirectAwayFromHub` (→ /hub/dashboard
 * para CADMIN/CMANAGER) e o dashboard bloqueava por falta de `hub.financial.read`.
 */
function resolveStaffRole(authRole: AppRole, user: unknown): ClinicStaffRole | null {
  const fromClinicRow = readClinicUserRole();
  if (fromClinicRow) return fromClinicRow;

  if (authRole && authRole !== 'UNKNOWN' && isHubStaffRoleKey(authRole)) return authRole;

  const fromUser = getUserRole(user);
  if (fromUser !== 'UNKNOWN' && isHubStaffRoleKey(fromUser)) return fromUser;

  return null;
}

export const usePermissions = () => {
  const { user, role: authRole, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [operationalAreas, setOperationalAreas] = useState<HubOperationalArea[]>([]);
  const [role, setRole] = useState<ClinicStaffRole | null>(null);
  // Começa `true` e só passa a `false` JUNTO com o `role` resolvido. Isto evita uma
  // janela em que `loading === false` e `role === null` no mesmo render — que fazia as
  // páginas dispararem `redirectAwayFromHub` antes do papel ser calculado (→ Dashboard).
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    // Aguarda o AuthContext terminar de carregar a sessão antes de decidir o papel.
    if (authLoading) return;

    const loadPermissions = () => {
      try {
        const r = resolveStaffRole(authRole, user);
        const areas = readClinicUserOperationalAreas();
        setRole(r);
        setOperationalAreas(areas);
        setPermissions(r ? mergePermissionsForRoleAndAreas(r, areas) : []);
      } catch (error) {
        console.error('[usePermissions] Error loading permissions:', error);
        setPermissions([]);
        setOperationalAreas([]);
        setRole(null);
      } finally {
        setResolved(true);
      }
    };

    loadPermissions();

    window.addEventListener('storage', loadPermissions);
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, loadPermissions);
    return () => {
      window.removeEventListener('storage', loadPermissions);
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, loadPermissions);
    };
  }, [authRole, user, authLoading]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      return hasEffectivePermission(role, permission, operationalAreas);
    },
    [role, operationalAreas],
  );

  return {
    role,
    operationalAreas,
    permissions,
    // Carregando enquanto a sessão não terminou OU o papel ainda não foi resolvido.
    loading: authLoading || !resolved,
    hasPermission,
  };
};
