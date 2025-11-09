import { useState, useEffect } from 'react';
import { PERMISSIONS, hasPermission as checkPermission } from '../utils/permissions';
import { Role } from '../types/units';

export const usePermissions = () => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = () => {
      try {
        const userStr = localStorage.getItem('user');
        const clinicUserStr = localStorage.getItem('clinic_user');
        
        if (!userStr || !clinicUserStr) {
          setPermissions([]);
          setRole(null);
          setLoading(false);
          return;
        }

        const user = JSON.parse(userStr);
        const clinicUser = JSON.parse(clinicUserStr);

        const userRole = clinicUser.role || null;
        setRole(userRole);

        if (userRole) {
          setPermissions(PERMISSIONS[userRole as Role] || []);
        } else {
          setPermissions([]);
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        setPermissions([]);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();

    // Listen for changes in localStorage (e.g., when unit changes)
    const handleStorageChange = () => {
      loadPermissions();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const hasPermission = (permission: string): boolean => {
    return checkPermission(role, permission);
  };

  // Convenience methods for common permissions
  const canCreateUnit = hasPermission('unit.create');
  const canEditUnit = hasPermission('unit.edit');
  const canDeleteUnit = hasPermission('unit.delete');
  
  const canInviteUser = hasPermission('user.invite');
  const canEditUser = hasPermission('user.edit');
  const canDeleteUser = hasPermission('user.delete');
  
  const canCreateDemand = hasPermission('demand.create');
  const canEditDemand = hasPermission('demand.edit');
  const canDeleteDemand = hasPermission('demand.delete');
  
  const canApproveApplication = hasPermission('application.approve');
  const canRejectApplication = hasPermission('application.reject');
  
  const canViewAudit = hasPermission('audit.view');

  return {
    role,
    permissions,
    loading,
    hasPermission,
    // Convenience flags
    canCreateUnit,
    canEditUnit,
    canDeleteUnit,
    canInviteUser,
    canEditUser,
    canDeleteUser,
    canCreateDemand,
    canEditDemand,
    canDeleteDemand,
    canApproveApplication,
    canRejectApplication,
    canViewAudit,
  };
};

