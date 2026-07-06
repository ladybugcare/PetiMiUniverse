import { useEffect, useMemo, useState } from 'react';
import { getStoredClinicId } from '@petimi/web-core';
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
  const clinicUserId = useMemo(() => readClinicUserId(), []);
  const [staffList, setStaffList] = useState<HubStaffMember[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, [clinicId]);

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
