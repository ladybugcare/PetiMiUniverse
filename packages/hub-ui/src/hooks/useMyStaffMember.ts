import { useEffect, useMemo, useState } from 'react';
import { CLINIC_STORAGE_UPDATED_EVENT, getStoredClinicId } from '@petimi/web-core';
import { hubStaffApi, type HubStaffMember } from '../api/hubStaffApi';

function readClinicUserId(): string | null {
  try {
    const raw = localStorage.getItem('clinic_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | null };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}

export function useMyStaffMember() {
  const clinicId = getStoredClinicId();
  const [clinicUserId, setClinicUserId] = useState<string | null>(() => readClinicUserId());
  const [staffList, setStaffList] = useState<HubStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refreshClinicUserId = () => setClinicUserId(readClinicUserId());
    refreshClinicUserId();
    window.addEventListener('storage', refreshClinicUserId);
    window.addEventListener(CLINIC_STORAGE_UPDATED_EVENT, refreshClinicUserId);
    return () => {
      window.removeEventListener('storage', refreshClinicUserId);
      window.removeEventListener(CLINIC_STORAGE_UPDATED_EVENT, refreshClinicUserId);
    };
  }, []);

  useEffect(() => {
    if (!clinicId) {
      setStaffList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void hubStaffApi
      .list(clinicId, { active_only: true })
      .then((r) => setStaffList(r.staff ?? []))
      .catch(() => setStaffList([]))
      .finally(() => setLoading(false));
  }, [clinicId, clinicUserId]);

  const myStaffMember = useMemo(() => {
    if (!clinicUserId) return null;
    return staffList.find((s) => s.clinic_user_id === clinicUserId) ?? null;
  }, [staffList, clinicUserId]);

  return {
    clinicId,
    clinicUserId,
    myStaffMember,
    staffList,
    loading,
    linked: Boolean(myStaffMember),
  };
}
