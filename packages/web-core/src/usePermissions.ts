import { useState, useEffect, useCallback } from 'react';
import { PERMISSIONS, hasPermission as checkPermission } from './permissions';
import type { ClinicStaffRole } from './types';
import { CLINIC_STORAGE_UPDATED_EVENT } from './constants/appEvents';

export const usePermissions = () => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<ClinicStaffRole | null>(null);
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

        const clinicUser = JSON.parse(clinicUserStr);
        const userRole = clinicUser.role || null;
        setRole(userRole);

        if (userRole) {
          setPermissions(PERMISSIONS[userRole as ClinicStaffRole] || []);
        } else {
          setPermissions([]);
        }
      } catch (error) {
        console.error('[usePermissions] Error loading permissions:', error);
        setPermissions([]);
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();

    const handleStorageChange = () => {
      loadPermissions();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, handleStorageChange);
    };
  }, []);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      return checkPermission(role, permission);
    },
    [role]
  );

  return {
    role,
    permissions,
    loading,
    hasPermission,
  };
};
